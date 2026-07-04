import { computeDescriptiveStats, type ColumnAggregates, type DescriptiveStatsSummary } from '$lib/analysis/descriptive-stats';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { quoteIdent } from './sql-ident';

/**
 * 選択した列それぞれについて COUNT/SUM/SUM_SQ/MIN/MAX を1本のSQLクエリで取得する。
 * sufficient-stats.tsと異なり、行を跨いだ整合性（全列非NULLの同じ行）を要求しないため
 * 単純に列ごとの集計関数を並べるだけでよい（各集計関数はSQLite標準でNULLを無視する）。
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
	if (!row) throw new Error('集計に失敗しました');

	const result: Record<string, ColumnAggregates> = {};
	columns.forEach((col, i) => {
		const n = Number(row[`n_${i}`] ?? 0);
		if (n === 0) throw new Error(`"${col}" に値のある行が見つかりませんでした`);
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

/** 中央値・四分位数・ヒストグラムを求めるための生データを、上限件数までフェッチする */
async function fetchColumnSample(db: D1Database, tableName: string, column: string, cap: number): Promise<number[]> {
	const c = quoteIdent(column);
	const sql = `SELECT ${c} AS v FROM ${quoteIdent(tableName)} WHERE ${c} IS NOT NULL LIMIT ?`;
	const res = await db
		.prepare(sql)
		.bind(cap)
		.all<{ v: number }>();
	return res.results.map((r) => Number(r.v));
}

export async function computeDescriptiveStatsFromDataSource(
	db: D1Database,
	dataSource: DataSource,
	columns: string[],
	sampleCap: number,
	histogramBins: number
): Promise<Record<string, DescriptiveStatsSummary>> {
	if (columns.length === 0) {
		throw new Error('統計を計算する列を1つ以上選択してください');
	}
	const schemaColumns = parseSchema(dataSource.schemaJson);
	const usable = new Set(continuousColumns(schemaColumns).map((c) => c.key));
	const invalid = columns.filter((c) => !usable.has(c));
	if (invalid.length > 0) {
		throw new Error(`数値列でないものが含まれています: ${invalid.join(', ')}`);
	}

	const aggregates = await computeColumnAggregates(db, dataSource.tableName, columns);

	const results: Record<string, DescriptiveStatsSummary> = {};
	for (const col of columns) {
		const sample = await fetchColumnSample(db, dataSource.tableName, col, sampleCap);
		results[col] = computeDescriptiveStats(aggregates[col], sample, histogramBins);
	}
	return results;
}
