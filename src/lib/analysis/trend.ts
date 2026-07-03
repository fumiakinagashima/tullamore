// トレンド予測のクライアントサイド再計算（isomorphic）。
// サーバー側（src/lib/server/analysis/trend.ts）はSQL集計でサマリー統計量を取得するが、
// こちらはグリッドで編集された生データ（メモリ上の配列）からその場で再学習するための版。
// 同じ回帰エンジン（registry.ts）を使うため、TREND_TIME_FEATURE は両者で共有する。
import type { LinearRegressionModel, SufficientStats } from './types';
import { fitModel, predict } from './registry';

export const TREND_TIME_FEATURE = '__time_days';

export type TrendRawRow = { date: string; value: number };
export type TrendPoint = { label: string; value: number };

/** 集計粒度。回帰計算自体は日単位の連続値（TREND_TIME_FEATURE）なので、粒度は表示・集計バケツと予測の刻み幅にのみ影響する */
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

/** ISO週（月曜始まり）の週初め日付をラベルとして使う */
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

/** 日付を粒度単位でn個先に進める（予測期間の刻み幅の生成に使う） */
function addPeriod(d: Date, granularity: TrendGranularity, n: number): Date {
	if (granularity === 'day') return new Date(d.getTime() + n * 86_400_000);
	if (granularity === 'week') return new Date(d.getTime() + n * 7 * 86_400_000);
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

function validRows(rows: TrendRawRow[]): TrendRawRow[] {
	return rows.filter((r) => r.date && Number.isFinite(toTimeMs(r.date)) && Number.isFinite(r.value));
}

/** グリッドの生データ（日付・数値のペア）から単回帰モデルを学習する。サーバー往復なしでブラウザ内で完結する */
export function fitTrendFromRows(rows: TrendRawRow[]): LinearRegressionModel {
	const valid = validRows(rows);
	if (valid.length === 0) throw new Error('分析対象のデータがありません');

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
 * 集計した実績値と、学習済みモデルによる「実績期間〜予測期間」通しのトレンド線を返す。
 * 2系列を同じ点数に揃えるのは server 版と同じ理由（LineChartは系列ごとの要素数で横位置を計算するため）。
 * granularity は表示・集計バケツと予測の刻み幅を変えるだけで、horizonMonths（予測期間の長さ）は従来通り月数で指定する
 * （例: 日次×半年後まで = 実測を日次集計し、直近の日から半年後までを1日刻みで予測する）。
 */
export function buildTrendSeries(
	rows: TrendRawRow[],
	model: LinearRegressionModel,
	horizonMonths: number,
	granularity: TrendGranularity = 'month'
): { historical: TrendPoint[]; trend: TrendPoint[]; historicalCount: number } {
	const valid = validRows(rows);
	if (valid.length === 0) throw new Error('分析対象のデータがありません');

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
