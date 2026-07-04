import type { ColumnDef } from '$lib/server/db/data-source-service';
import type { DbConnectionDriver, ExternalTableRef } from './types';

/** 取り込み対象の1列。key/label/type はTullamore側のColumnDef、externalName は外部DB側の実際の列名 */
export type SyncColumn = ColumnDef & { externalName: string };

const BATCH_SIZE = 100;
// 1回のHTTPリクエスト（同期実行）で取り込む行数の上限。Workersの1リクエストCPU時間制限に収まるよう
// 抑えた暫定値で、これを超える分はQueueベースの継続取り込み（ingestExternalTableChunk）に引き継ぐ。
const SYNC_ROW_BUDGET = 50_000;
// Queue consumer 1回の呼び出し（1メッセージ）で処理する行数の上限。Queue consumerはHTTPリクエストより
// 緩やかだが無限ではないため、キリよく数千〜数万行単位に区切り、残りがあれば自分自身を再度キューに積む。
export const QUEUE_BATCH_ROWS = 20_000;

export type IngestResult = {
	inserted: number;
	/** SYNC_ROW_BUDGET に達して打ち切った場合 true（続きはQueueで取り込む） */
	truncated: boolean;
};

export type IngestChunkResult = {
	/** このチャンクで挿入した行数 */
	inserted: number;
	/** 外部テーブルの末尾に達した（=もう続きがない）場合 true */
	done: boolean;
};

function coerceValue(value: unknown, type: ColumnDef['type']): string | number | null {
	if (value === null || value === undefined) return null;
	if (type === 'number') return Number(value);
	if (type === 'boolean') return value ? 1 : 0;
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

/**
 * 外部テーブルから行を取得し、D1の物理テーブルへ投入する共通ループ。
 * `replaceExisting`が真なら最初のバッチにDELETEを原子的に含める（全件洗い替え）。
 * `offset`から始めて`rowBudget`行に達するか外部テーブルの末尾に達したら終了する。
 */
async function runIngestBatches(
	db: D1Database,
	driver: DbConnectionDriver,
	table: ExternalTableRef,
	tableName: string,
	columns: SyncColumn[],
	offset: number,
	rowBudget: number,
	replaceExisting: boolean
): Promise<{ inserted: number; done: boolean }> {
	const colKeys = columns.map((c) => c.key);
	const externalNames = columns.map((c) => c.externalName);
	const placeholders = colKeys.map(() => '?').join(', ');
	const colList = colKeys.map((k) => `\`${k}\``).join(', ');
	const insertSql = `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders})`;
	const deleteStmt = db.prepare(`DELETE FROM \`${tableName}\``);

	let inserted = 0;
	let cursor = offset;
	let firstBatch = true;
	let done = false;

	while (inserted < rowBudget) {
		const rows = await driver.fetchRows(table, externalNames, cursor, BATCH_SIZE);
		if (rows.length === 0) {
			done = true;
			break;
		}

		const stmts = rows.map((row) => {
			const values = columns.map((c) => coerceValue(row[c.externalName], c.type));
			return db.prepare(insertSql).bind(...values);
		});
		await db.batch(replaceExisting && firstBatch ? [deleteStmt, ...stmts] : stmts);
		firstBatch = false;

		inserted += rows.length;
		cursor += rows.length;
		if (rows.length < BATCH_SIZE) {
			done = true;
			break; // 最後のページ
		}
	}

	if (replaceExisting && inserted === 0 && offset === 0) {
		// 空テーブルの場合も既存データの削除だけは実行する（CSVインポートの空ファイルreplaceと同じ扱い）
		await db.batch([deleteStmt]);
	}

	return { inserted, done };
}

/**
 * 外部テーブルから行を取得し、D1の物理テーブルへ全件洗い替えで投入する（同期実行、1リクエスト内）。
 * CSVインポート（src/routes/api/data-sources/[id]/import/+server.ts）と同じ
 * 「100行ずつ db.batch() でチャンク投入し、DELETEは最初のバッチに含めて原子的にコミットする」パターンを踏襲する。
 * SYNC_ROW_BUDGETに達して打ち切った場合は`truncated: true`を返し、呼び出し側がQueueへ継続取り込みを積む。
 */
export async function ingestExternalTable(
	db: D1Database,
	driver: DbConnectionDriver,
	table: ExternalTableRef,
	tableName: string,
	columns: SyncColumn[]
): Promise<IngestResult> {
	const { inserted, done } = await runIngestBatches(db, driver, table, tableName, columns, 0, SYNC_ROW_BUDGET, true);
	return { inserted, truncated: !done };
}

/**
 * Queue consumer から呼ばれる継続取り込みの1チャンク分。`offset`から続きを取得し、DELETEは行わず追記する
 * （最初のDELETEは同期実行側のingestExternalTableが既に行っている前提）。QUEUE_BATCH_ROWSに達してもまだ
 * 続きがある場合は`done: false`を返し、呼び出し側（queue-consumer.ts）が次のoffsetで自身を再度キューに積む。
 */
export async function ingestExternalTableChunk(
	db: D1Database,
	driver: DbConnectionDriver,
	table: ExternalTableRef,
	tableName: string,
	columns: SyncColumn[],
	offset: number
): Promise<IngestChunkResult> {
	return runIngestBatches(db, driver, table, tableName, columns, offset, QUEUE_BATCH_ROWS, false);
}
