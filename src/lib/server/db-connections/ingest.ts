import type { ColumnDef } from '$lib/server/db/data-source-service';
import type { DbConnectionDriver, ExternalTableRef } from './types';

/** One column to ingest. key/label/type are Tullamore's ColumnDef; externalName is the actual column name on the external DB */
export type SyncColumn = ColumnDef & { externalName: string };

const BATCH_SIZE = 100;
// Upper bound on the number of rows ingested per HTTP request (synchronous run). This is a provisional
// value kept low enough to fit within a Worker's per-request CPU time limit; anything beyond this is
// handed off to the Queue-based continuation ingest (ingestExternalTableChunk).
const SYNC_ROW_BUDGET = 50_000;
// Upper bound on the number of rows processed per Queue consumer invocation (one message). Queue consumers
// have more relaxed limits than an HTTP request, but not unlimited ones, so we chunk into a round few-thousand
// to tens-of-thousands of rows and re-enqueue ourselves for any remainder.
export const QUEUE_BATCH_ROWS = 20_000;

export type IngestResult = {
	inserted: number;
	/** true if ingestion was cut off after hitting SYNC_ROW_BUDGET (the rest continues via Queue) */
	truncated: boolean;
};

export type IngestChunkResult = {
	/** Number of rows inserted in this chunk */
	inserted: number;
	/** true if the end of the external table was reached (i.e. there is no more to process) */
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
 * Common loop that fetches rows from an external table and writes them into the D1 physical table.
 * If `replaceExisting` is true, a DELETE is atomically included in the first batch (full replace).
 * Starts at `offset` and finishes once `rowBudget` rows are reached or the end of the external table is hit.
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
			break; // last page
		}
	}

	if (replaceExisting && inserted === 0 && offset === 0) {
		// Even for an empty table, still delete existing data (same handling as replacing with an empty CSV import file)
		await db.batch([deleteStmt]);
	}

	return { inserted, done };
}

/**
 * Fetches rows from an external table and writes them into the D1 physical table as a full replace
 * (synchronous run, within a single request). Follows the same pattern as the CSV import
 * (src/routes/api/data-sources/[id]/import/+server.ts): "insert in chunks of 100 rows via db.batch(),
 * with the DELETE atomically committed as part of the first batch."
 * If ingestion is cut off after hitting SYNC_ROW_BUDGET, returns `truncated: true` so the caller can
 * enqueue a Queue job to continue ingestion.
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
 * One chunk of continuation ingest, called from the Queue consumer. Resumes from `offset` and appends
 * without issuing a DELETE (on the assumption that the initial DELETE was already done by the synchronous
 * ingestExternalTable). If there is still more to process after reaching QUEUE_BATCH_ROWS, returns
 * `done: false` so the caller (queue-consumer.ts) re-enqueues itself at the next offset.
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
