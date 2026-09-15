// Client-side recomputation of trend forecasts (isomorphic).
// The server side (src/lib/server/analysis/trend.ts) gets summary statistics via SQL aggregation,
// but this version retrains on the spot from raw data (an in-memory array) as edited in the grid.
// Since it uses the same regression engine (registry.ts), TREND_TIME_FEATURE is shared between the two.
import type { LinearRegressionModel, SufficientStats } from './types';
import { fitModel, predict } from './registry';

export const TREND_TIME_FEATURE = '__time_days';

export type TrendRawRow = { date: string; value: number };
export type TrendPoint = { label: string; value: number };

/** Aggregation granularity. Since the regression itself operates on a continuous, daily-resolution value (TREND_TIME_FEATURE), granularity only affects the display/aggregation buckets and the forecast step size */
export type TrendGranularity = 'day' | 'week' | 'month';

function toTimeMs(dateStr: string): number {
	return new Date(dateStr).getTime();
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function monthLabel(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function dayLabel(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Uses the start-of-week date (ISO week, starting Monday) as the label */
function weekLabel(dateStr: string): string {
	const d = new Date(dateStr);
	const day = d.getUTCDay();
	const diffToMonday = day === 0 ? -6 : 1 - day;
	const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
	return dayLabel(monday.toISOString());
}

function bucketLabel(dateStr: string, granularity: TrendGranularity): string {
	if (granularity === 'day') return dayLabel(dateStr);
	if (granularity === 'week') return weekLabel(dateStr);
	return monthLabel(dateStr);
}

/** Advances a date by n granularity units (used to generate the forecast period's step increments) */
function addPeriod(d: Date, granularity: TrendGranularity, n: number): Date {
	if (granularity === 'day') return new Date(d.getTime() + n * 86_400_000);
	if (granularity === 'week') return new Date(d.getTime() + n * 7 * 86_400_000);
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

function validRows(rows: TrendRawRow[]): TrendRawRow[] {
	return rows.filter((r) => r.date && Number.isFinite(toTimeMs(r.date)) && Number.isFinite(r.value));
}

/** Trains a simple regression model from the grid's raw data (date/value pairs). Runs entirely in the browser, with no server round trip */
export function fitTrendFromRows(rows: TrendRawRow[]): LinearRegressionModel {
	const valid = validRows(rows);
	if (valid.length === 0) throw new Error('No data to analyze');

	const baseMs = Math.min(...valid.map((r) => toTimeMs(r.date)));

	let n = 0;
	let targetSum = 0;
	let targetSumSq = 0;
	let xSum = 0;
	let xTargetSum = 0;
	let xSumSq = 0;
	let xMin = Infinity;
	let xMax = -Infinity;

	for (const r of valid) {
		const x = (toTimeMs(r.date) - baseMs) / 86_400_000;
		const y = r.value;
		n++;
		targetSum += y;
		targetSumSq += y * y;
		xSum += x;
		xTargetSum += x * y;
		xSumSq += x * x;
		if (x < xMin) xMin = x;
		if (x > xMax) xMax = x;
	}

	const stats: SufficientStats = {
		n,
		targetSum,
		targetSumSq,
		featureSums: { [TREND_TIME_FEATURE]: xSum },
		featureTargetSums: { [TREND_TIME_FEATURE]: xTargetSum },
		featureCrossSums: { [TREND_TIME_FEATURE]: { [TREND_TIME_FEATURE]: xSumSq } },
		featureMin: { [TREND_TIME_FEATURE]: xMin },
		featureMax: { [TREND_TIME_FEATURE]: xMax }
	};

	return fitModel('linear_regression', stats, 'value', [TREND_TIME_FEATURE]) as LinearRegressionModel;
}

/**
 * Returns the aggregated actual values along with a trend line from the trained model spanning
 * the actuals period through the forecast period. The two series are aligned to the same number
 * of points for the same reason as the server version (LineChart computes horizontal position
 * from each series' element count).
 * granularity only changes the display/aggregation buckets and the forecast step size;
 * horizonMonths (the length of the forecast period) is still specified in months as before
 * (e.g. daily granularity x 6-month horizon = aggregate actuals daily, then forecast day-by-day
 * from the most recent date out to 6 months later).
 */
export function buildTrendSeries(
	rows: TrendRawRow[],
	model: LinearRegressionModel,
	horizonMonths: number,
	granularity: TrendGranularity = 'month'
): { historical: TrendPoint[]; trend: TrendPoint[]; historicalCount: number } {
	const valid = validRows(rows);
	if (valid.length === 0) throw new Error('No data to analyze');

	const baseMs = Math.min(...valid.map((r) => toTimeMs(r.date)));

	const byBucket = new Map<string, { sum: number; count: number; xSum: number }>();
	for (const r of valid) {
		const label = bucketLabel(r.date, granularity);
		const x = (toTimeMs(r.date) - baseMs) / 86_400_000;
		const bucket = byBucket.get(label) ?? { sum: 0, count: 0, xSum: 0 };
		bucket.sum += r.value;
		bucket.count += 1;
		bucket.xSum += x;
		byBucket.set(label, bucket);
	}
	const buckets = [...byBucket.keys()].sort();
	const historical: TrendPoint[] = buckets.map((label) => {
		const b = byBucket.get(label)!;
		return { label, value: b.sum / b.count };
	});
	const historicalX = buckets.map((label) => {
		const b = byBucket.get(label)!;
		return b.xSum / b.count;
	});

	const lastMs = Math.max(...valid.map((r) => toTimeMs(r.date)));
	const lastDate = new Date(lastMs);
	const horizonEndMs = addPeriod(lastDate, 'month', horizonMonths).getTime();

	const futureLabels: string[] = [];
	const futureX: number[] = [];
	let cursor = addPeriod(lastDate, granularity, 1);
	while (cursor.getTime() <= horizonEndMs) {
		futureLabels.push(bucketLabel(cursor.toISOString(), granularity));
		futureX.push((cursor.getTime() - baseMs) / 86_400_000);
		cursor = addPeriod(cursor, granularity, 1);
	}

	const trend: TrendPoint[] = [
		...historicalX.map((x, i) => ({ label: buckets[i], value: predict(model, { [TREND_TIME_FEATURE]: x }) })),
		...futureX.map((x, i) => ({ label: futureLabels[i], value: predict(model, { [TREND_TIME_FEATURE]: x }) }))
	];
	const historicalPadded: TrendPoint[] = [
		...historical,
		...futureLabels.map((label, i) => ({ label, value: trend[buckets.length + i].value }))
	];

	return { historical: historicalPadded, trend, historicalCount: buckets.length };
}
