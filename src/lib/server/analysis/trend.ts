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
 * Fetches summary statistics for trend forecasting with a single SQL aggregate query.
 * Converts the date column into a day count (real number) via julianday() and reuses the existing
 * sufficient-stats approach (Σx, Σy, Σxy, etc.) as-is, treating time as a single-variable regression feature.
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
	// julianday()'s absolute value is roughly 2.46 million, which is very large; feeding it into the
	// regression as-is worsens the condition number of the normal equations (XtX) and causes numerical
	// instability (the intercept and slope collapse to nearly 0). Convert to elapsed days from the
	// minimum date in the data (a small, 0-based value) before running the regression
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
		throw new Error('No rows without missing values were found for analysis');
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
		throw new Error(`Date column "${dateColumn}" was not found or is not of date type`);
	}
	const usable = new Set(continuousColumns(columns).map((c) => c.key));
	if (!usable.has(targetColumn)) {
		throw new Error(`Target variable "${targetColumn}" is not a numeric column or does not exist in the data source`);
	}

	const stats = await computeTrendStats(db, dataSource.tableName, dateColumn, targetColumn);
	return fitModel('linear_regression', stats, targetColumn, [TREND_TIME_FEATURE]) as LinearRegressionModel;
}

export type TrendSeriesPoint = { label: string; value: number };

/**
 * Returns monthly-aggregated actuals along with the trend line computed from the trained model, spanning
 * continuously from the historical period through the forecast period. Aligning both series to the same
 * number of months (historical + forecast) keeps their horizontal positions from drifting apart on the
 * line chart (LineChart computes horizontal position from each series' element count, so series of
 * different lengths would otherwise be misaligned).
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
	// Compute elapsed days on the same basis as computeTrendStats (the minimum date in the data) to keep the x scale consistent
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
		throw new Error('No rows without missing values were found for analysis');
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
