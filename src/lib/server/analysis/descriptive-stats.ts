import { computeDescriptiveStats, type ColumnAggregates, type DescriptiveStatsSummary } from '$lib/analysis/descriptive-stats';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { quoteIdent } from './sql-ident';

/**
 * Fetches COUNT/SUM/SUM_SQ/MIN/MAX for each selected column in a single SQL query.
 * Unlike sufficient-stats.ts, this doesn't require cross-row consistency (the same row being
 * non-NULL across all columns), so it's fine to simply line up per-column aggregate functions
 * (each aggregate function ignores NULL per the SQLite standard).
 */
async function computeColumnAggregates(db: D1Database, tableName: string, columns: string[]): Promise<Record<string, ColumnAggregates>> {
	const selects: string[] = [];
	columns.forEach((col, i) => {
		const c = quoteIdent(col);
		selects.push(`COUNT(${c}) AS n_${i}`);
		selects.push(`SUM(${c}) AS sum_${i}`);
		selects.push(`SUM(${c}*${c}) AS sumsq_${i}`);
		selects.push(`MIN(${c}) AS min_${i}`);
		selects.push(`MAX(${c}) AS max_${i}`);
	});
	const sql = `SELECT ${selects.join(', ')} FROM ${quoteIdent(tableName)}`;
	const row = await db.prepare(sql).first<Record<string, number | null>>();
	if (!row) throw new Error('Aggregation failed');

	const result: Record<string, ColumnAggregates> = {};
	columns.forEach((col, i) => {
		const n = Number(row[`n_${i}`] ?? 0);
		if (n === 0) throw new Error(`No rows with a value for "${col}" were found`);
		result[col] = {
			n,
			sum: Number(row[`sum_${i}`] ?? 0),
			sumSq: Number(row[`sumsq_${i}`] ?? 0),
			min: Number(row[`min_${i}`] ?? 0),
			max: Number(row[`max_${i}`] ?? 0)
		};
	});
	return result;
}

/** Fetches raw data, up to a maximum row count, for computing the median, quartiles, and histogram */
async function fetchColumnSample(db: D1Database, tableName: string, column: string, cap: number): Promise<number[]> {
	const c = quoteIdent(column);
	const sql = `SELECT ${c} AS v FROM ${quoteIdent(tableName)} WHERE ${c} IS NOT NULL LIMIT ?`;
	const res = await db
		.prepare(sql)
		.bind(cap)
		.all<{ v: number }>();
	return res.results.map((r) => Number(r.v));
}

/**
 * Fetches just the current mean of a column with a single aggregate query, without sampling raw
 * data. Intended for use cases like KPI achievement-rate tracking where only the mean is needed
 * (lighter weight since it skips the median, histogram, etc.).
 */
/**
 * When a dateRange is given and no rows fall within that period, returns null instead of throwing.
 * This is so that "no actuals yet" — a normal state, such as right after creating a KPI plan
 * targeting a future period — can be distinguished by the caller from a genuine error such as the
 * data source having been deleted, and explicitly shown as "no actuals data yet." When dateRange is
 * omitted (i.e. the full period) and the target column itself has no values at all, that is a real
 * error, so an exception is still thrown in that case as before.
 */
export async function computeCurrentMean(
	db: D1Database,
	dataSource: DataSource,
	column: string,
	dateRange?: { column: string; from: string; to: string }
): Promise<number | null> {
	const schemaColumns = parseSchema(dataSource.schemaJson);
	const usable = new Set(continuousColumns(schemaColumns).map((c) => c.key));
	if (!usable.has(column)) {
		throw new Error(`"${column}" is not a numeric column`);
	}

	if (!dateRange) {
		const aggregates = await computeColumnAggregates(db, dataSource.tableName, [column]);
		return aggregates[column].sum / aggregates[column].n;
	}

	// Build a dedicated query with a WHERE clause instead of reusing the shared computeColumnAggregates
	// logic, so the comparison is date-only (date() normalizes variations in SQLite's datetime string
	// representation)
	const c = quoteIdent(column);
	const d = quoteIdent(dateRange.column);
	const table = quoteIdent(dataSource.tableName);
	const sql = `SELECT COUNT(${c}) AS n, SUM(${c}) AS total FROM ${table} WHERE date(${d}) BETWEEN date(?) AND date(?)`;
	const row = await db.prepare(sql).bind(dateRange.from, dateRange.to).first<{ n: number; total: number | null }>();
	const n = Number(row?.n ?? 0);
	if (n === 0) return null;
	return Number(row!.total ?? 0) / n;
}

export async function computeDescriptiveStatsFromDataSource(
	db: D1Database,
	dataSource: DataSource,
	columns: string[],
	sampleCap: number,
	histogramBins: number
): Promise<Record<string, DescriptiveStatsSummary>> {
	if (columns.length === 0) {
		throw new Error('Please select at least one column to compute statistics for');
	}
	const schemaColumns = parseSchema(dataSource.schemaJson);
	const usable = new Set(continuousColumns(schemaColumns).map((c) => c.key));
	const invalid = columns.filter((c) => !usable.has(c));
	if (invalid.length > 0) {
		throw new Error(`The following are not numeric columns: ${invalid.join(', ')}`);
	}

	const aggregates = await computeColumnAggregates(db, dataSource.tableName, columns);

	const results: Record<string, DescriptiveStatsSummary> = {};
	for (const col of columns) {
		const sample = await fetchColumnSample(db, dataSource.tableName, col, sampleCap);
		results[col] = computeDescriptiveStats(aggregates[col], sample, histogramBins);
	}
	return results;
}
