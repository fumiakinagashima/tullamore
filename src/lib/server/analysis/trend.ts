import type { LinearRegressionModel, SufficientStats } from '$lib/analysis/types';
import { fitModel, predict } from '$lib/analysis/registry';
import { continuousColumns } from '$lib/analysis/column-type';
import { TREND_TIME_FEATURE } from '$lib/analysis/trend';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';

export { TREND_TIME_FEATURE };

function quoteIdent(name: string): string {
	return `\`${name.replace(/`/g, '``')}\``;
}

/**
 * トレンド予測用のサマリー統計量を1本のSQL集計クエリで取得する。
 * 日付列を julianday() で日数（実数）に変換し、時間を説明変数とする単回帰として
 * 既存の sufficient-stats 方式（Σx, Σy, Σxy 等）をそのまま流用する。
 */
export async function computeTrendStats(
	db: D1Database,
	tableName: string,
	dateColumn: string,
	targetColumn: string
): Promise<SufficientStats> {
	const d = quoteIdent(dateColumn);
	const t = quoteIdent(targetColumn);
	const table = quoteIdent(tableName);
	// julianday() の絶対値は約246万と非常に大きく、そのまま回帰にかけると正規方程式（XtX）の
	// 条件数が悪化し数値的に不安定になる（切片と傾きがほぼ0に潰れる）。データ内の最小日付からの
	// 経過日数（0起点の小さい値）に変換してから回帰にかける
	const x = `(julianday(${d}) - (SELECT MIN(julianday(${d})) FROM ${table}))`;

	const sql = `
		SELECT
			COUNT(*) AS n,
			SUM(${t}) AS target_sum,
			SUM(${t}*${t}) AS target_sum_sq,
			SUM(${x}) AS x_sum,
			SUM(${x}*${t}) AS x_target_sum,
			SUM(${x}*${x}) AS x_sum_sq,
			MIN(${x}) AS x_min,
			MAX(${x}) AS x_max
		FROM ${table}
		WHERE ${d} IS NOT NULL AND ${t} IS NOT NULL
	`;

	const row = await db.prepare(sql).first<Record<string, number | null>>();
	if (!row || !row.n) {
		throw new Error('分析対象の欠損値のない行が見つかりませんでした');
	}

	return {
		n: Number(row.n),
		targetSum: Number(row.target_sum ?? 0),
		targetSumSq: Number(row.target_sum_sq ?? 0),
		featureSums: { [TREND_TIME_FEATURE]: Number(row.x_sum ?? 0) },
		featureTargetSums: { [TREND_TIME_FEATURE]: Number(row.x_target_sum ?? 0) },
		featureCrossSums: { [TREND_TIME_FEATURE]: { [TREND_TIME_FEATURE]: Number(row.x_sum_sq ?? 0) } },
		featureMin: { [TREND_TIME_FEATURE]: Number(row.x_min ?? 0) },
		featureMax: { [TREND_TIME_FEATURE]: Number(row.x_max ?? 0) }
	};
}

export async function fitTrendFromDataSource(
	db: D1Database,
	dataSource: DataSource,
	dateColumn: string,
	targetColumn: string
): Promise<LinearRegressionModel> {
	const columns = parseSchema(dataSource.schemaJson);

	const dateCol = columns.find((c) => c.key === dateColumn);
	if (!dateCol || dateCol.type !== 'date') {
		throw new Error(`日付列 "${dateColumn}" が見つからないか、日付型ではありません`);
	}
	const usable = new Set(continuousColumns(columns).map((c) => c.key));
	if (!usable.has(targetColumn)) {
		throw new Error(`目的変数 "${targetColumn}" は数値列ではないか、データソースに存在しません`);
	}

	const stats = await computeTrendStats(db, dataSource.tableName, dateColumn, targetColumn);
	return fitModel('linear_regression', stats, targetColumn, [TREND_TIME_FEATURE]) as LinearRegressionModel;
}

export type TrendSeriesPoint = { label: string; value: number };

/**
 * 月次集計した実績値と、学習済みモデルから計算した「実績期間〜予測期間」通しのトレンド線を返す。
 * 2系列を同じ月数（実績+予測）に揃えることで、折れ線グラフ上で横位置がずれないようにする
 * （LineChartは各系列の要素数を元に横位置を計算するため、系列間で長さが違うとズレる）。
 */
export async function getTrendSeries(
	db: D1Database,
	tableName: string,
	dateColumn: string,
	targetColumn: string,
	horizonMonths: number,
	model: LinearRegressionModel
): Promise<{ historical: TrendSeriesPoint[]; trend: TrendSeriesPoint[]; historicalCount: number }> {
	const d = quoteIdent(dateColumn);
	const t = quoteIdent(targetColumn);
	const table = quoteIdent(tableName);
	// computeTrendStats と同じ基準（データ内の最小日付）で経過日数を計算し、xのスケールを揃える
	const baseJulian = `(SELECT MIN(julianday(${d})) FROM ${table})`;

	const histSql = `
		SELECT strftime('%Y-%m', ${d}) AS ym, AVG(${t}) AS avg_target, AVG(julianday(${d}) - ${baseJulian}) AS avg_x
		FROM ${table}
		WHERE ${d} IS NOT NULL AND ${t} IS NOT NULL
		GROUP BY ym
		ORDER BY ym
	`;
	const histResult = await db.prepare(histSql).all<{ ym: string; avg_target: number; avg_x: number }>();
	const histRows = histResult.results ?? [];
	if (histRows.length === 0) {
		throw new Error('分析対象の欠損値のない行が見つかりませんでした');
	}

	const futureSql = `
		WITH RECURSIVE steps(n) AS (
			SELECT 1
			UNION ALL
			SELECT n + 1 FROM steps WHERE n < ?
		)
		SELECT
			n,
			strftime('%Y-%m', date((SELECT MAX(${d}) FROM ${table}), '+' || n || ' months')) AS ym,
			julianday(date((SELECT MAX(${d}) FROM ${table}), '+' || n || ' months')) - ${baseJulian} AS x
		FROM steps
		ORDER BY n
	`;
	const futureResult = await db.prepare(futureSql).bind(horizonMonths).all<{ n: number; ym: string; x: number }>();
	const futureRows = futureResult.results ?? [];

	const historical: TrendSeriesPoint[] = histRows.map((r) => ({ label: r.ym, value: r.avg_target }));
	const trend: TrendSeriesPoint[] = [
		...histRows.map((r) => ({ label: r.ym, value: predict(model, { [TREND_TIME_FEATURE]: r.avg_x }) })),
		...futureRows.map((r) => ({ label: r.ym, value: predict(model, { [TREND_TIME_FEATURE]: r.x }) }))
	];
	const historicalPadded: TrendSeriesPoint[] = [
		...historical,
		...futureRows.map((r, i) => ({ label: r.ym, value: trend[histRows.length + i].value }))
	];

	return { historical: historicalPadded, trend, historicalCount: histRows.length };
}
