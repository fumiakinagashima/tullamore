import type { ColumnDef } from '$lib/server/db/data-source-service';
import type { DbConnectionDriver, ExternalTableRef } from './types';

/** 取り込み対象の1列。key/label/type はTullamore側のColumnDef、externalName は外部DB側の実際の列名 */
export type SyncColumn = ColumnDef & { externalName: string };

const BATCH_SIZE = 100;
// 1回の同期リクエストで取り込む行数の上限（Workersの1リクエストCPU時間制限を超えないための暫定措置）。
// TODO: これを超える大規模テーブルはQueueベースの非同期取り込みに置き換える（docs/ROADMAP.md Phase 7参照）
const MAX_ROWS = 50_000;

export type IngestResult = {
	inserted: number;
	/** MAX_ROWS に達して打ち切った場合 true */
	truncated: boolean;
};

function coerceValue(value: unknown, type: ColumnDef['type']): string | number | null {
	if (value === null || value === undefined) return null;
	if (type === 'number') return Number(value);
	if (type === 'boolean') return value ? 1 : 0;
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

/**
 * 外部テーブルから行を取得し、D1の物理テーブルへ全件洗い替えで投入する。
 * CSVインポート（src/routes/api/data-sources/[id]/import/+server.ts）と同じ
 * 「100行ずつ db.batch() でチャンク投入し、DELETEは最初のバッチに含めて原子的にコミットする」パターンを踏襲する。
 */
export async function ingestExternalTable(
	db: D1Database,
	driver: DbConnectionDriver,
	table: ExternalTableRef,
	tableName: string,
	columns: SyncColumn[]
): Promise<IngestResult> {
	const colKeys = columns.map((c) => c.key);
	const externalNames = columns.map((c) => c.externalName);
	const placeholders = colKeys.map(() => '?').join(', ');
	const colList = colKeys.map((k) => `\`${k}\``).join(', ');
	const insertSql = `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders})`;
	const deleteStmt = db.prepare(`DELETE FROM \`${tableName}\``);

	let inserted = 0;
	let offset = 0;
	let firstBatch = true;

	while (inserted < MAX_ROWS) {
		const rows = await driver.fetchRows(table, externalNames, offset, BATCH_SIZE);
		if (rows.length === 0) break;

		const stmts = rows.map((row) => {
			const values = columns.map((c) => coerceValue(row[c.externalName], c.type));
			return db.prepare(insertSql).bind(...values);
		});
		await db.batch(firstBatch ? [deleteStmt, ...stmts] : stmts);
		firstBatch = false;

		inserted += rows.length;
		offset += rows.length;
		if (rows.length < BATCH_SIZE) break; // 最後のページ
	}

	if (inserted === 0) {
		// 空テーブルの場合も既存データの削除だけは実行する（CSVインポートの空ファイルreplaceと同じ扱い）
		await db.batch([deleteStmt]);
	}

	return { inserted, truncated: inserted >= MAX_ROWS };
}
