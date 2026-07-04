import type { SufficientStats } from '$lib/analysis/types';
import { quoteIdent } from './sql-ident';

/**
 * 回帰分析に必要なサマリー統計量（Σx, Σy, Σxᵢxⱼ 等）を1本のSQL集計クエリでD1から取得する。
 * 行データを全件Workersに読み込まないため、元データの件数に対して計算コストがスケールしない
 * （詳細は docs/ROADMAP.md の「既存のSQL集計・可視化とシミュレーターの処理フロー・CPU時間について」参照）。
 */
export async function computeSufficientStats(
	db: D1Database,
	tableName: string,
	targetColumn: string,
	featureColumns: string[]
): Promise<SufficientStats> {
	const t = quoteIdent(targetColumn);
	const cols = featureColumns.map(quoteIdent);

	const selects: string[] = ['COUNT(*) AS n', `SUM(${t}) AS target_sum`, `SUM(${t}*${t}) AS target_sum_sq`];
	featureColumns.forEach((col, i) => {
		selects.push(`SUM(${cols[i]}) AS sum_${i}`);
		selects.push(`SUM(${cols[i]}*${t}) AS sum_${i}_target`);
		selects.push(`MIN(${cols[i]}) AS min_${i}`);
		selects.push(`MAX(${cols[i]}) AS max_${i}`);
		for (let j = i; j < featureColumns.length; j++) {
			selects.push(`SUM(${cols[i]}*${cols[j]}) AS cross_${i}_${j}`);
		}
	});

	const whereCols = [t, ...cols];
	const where = whereCols.map((c) => `${c} IS NOT NULL`).join(' AND ');
	const sql = `SELECT ${selects.join(', ')} FROM ${quoteIdent(tableName)} WHERE ${where}`;

	const row = await db.prepare(sql).first<Record<string, number | null>>();
	if (!row || !row.n) {
		throw new Error('分析対象の欠損値のない行が見つかりませんでした');
	}

	const n = Number(row.n);
	const featureSums: Record<string, number> = {};
	const featureTargetSums: Record<string, number> = {};
	const featureCrossSums: Record<string, Record<string, number>> = {};
	const featureMin: Record<string, number> = {};
	const featureMax: Record<string, number> = {};

	featureColumns.forEach((col, i) => {
		featureSums[col] = Number(row[`sum_${i}`] ?? 0);
		featureTargetSums[col] = Number(row[`sum_${i}_target`] ?? 0);
		featureMin[col] = Number(row[`min_${i}`] ?? 0);
		featureMax[col] = Number(row[`max_${i}`] ?? 0);
		featureCrossSums[col] = {};
		for (let j = i; j < featureColumns.length; j++) {
			featureCrossSums[col][featureColumns[j]] = Number(row[`cross_${i}_${j}`] ?? 0);
		}
	});

	return {
		n,
		targetSum: Number(row.target_sum ?? 0),
		targetSumSq: Number(row.target_sum_sq ?? 0),
		featureSums,
		featureTargetSums,
		featureCrossSums,
		featureMin,
		featureMax
	};
}
