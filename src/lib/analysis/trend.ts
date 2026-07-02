// トレンド予測のクライアントサイド再計算（isomorphic）。
// サーバー側（src/lib/server/analysis/trend.ts）はSQL集計でサマリー統計量を取得するが、
// こちらはグリッドで編集された生データ（メモリ上の配列）からその場で再学習するための版。
// 同じ回帰エンジン（registry.ts）を使うため、TREND_TIME_FEATURE は両者で共有する。
import type { LinearRegressionModel, SufficientStats } from './types';
import { fitModel, predict } from './registry';

export const TREND_TIME_FEATURE = '__time_days';

export type TrendRawRow = { date: string; value: number };
export type TrendPoint = { label: string; value: number };

function toTimeMs(dateStr: string): number {
	return new Date(dateStr).getTime();
}

function monthLabel(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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
 * 月次集計した実績値と、学習済みモデルによる「実績期間〜予測期間」通しのトレンド線を返す。
 * 2系列を同じ月数に揃えるのは server 版と同じ理由（LineChartは系列ごとの要素数で横位置を計算するため）。
 */
export function buildTrendSeries(
	rows: TrendRawRow[],
	model: LinearRegressionModel,
	horizonMonths: number
): { historical: TrendPoint[]; trend: TrendPoint[]; historicalCount: number } {
	const valid = validRows(rows);
	if (valid.length === 0) throw new Error('分析対象のデータがありません');

	const baseMs = Math.min(...valid.map((r) => toTimeMs(r.date)));

	const byMonth = new Map<string, { sum: number; count: number; xSum: number }>();
	for (const r of valid) {
		const label = monthLabel(r.date);
		const x = (toTimeMs(r.date) - baseMs) / 86_400_000;
		const bucket = byMonth.get(label) ?? { sum: 0, count: 0, xSum: 0 };
		bucket.sum += r.value;
		bucket.count += 1;
		bucket.xSum += x;
		byMonth.set(label, bucket);
	}
	const months = [...byMonth.keys()].sort();
	const historical: TrendPoint[] = months.map((label) => {
		const b = byMonth.get(label)!;
		return { label, value: b.sum / b.count };
	});
	const historicalX = months.map((label) => {
		const b = byMonth.get(label)!;
		return b.xSum / b.count;
	});

	const lastMs = Math.max(...valid.map((r) => toTimeMs(r.date)));
	const lastDate = new Date(lastMs);
	const futureLabels: string[] = [];
	const futureX: number[] = [];
	for (let i = 1; i <= horizonMonths; i++) {
		const d = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + i, lastDate.getUTCDate()));
		futureLabels.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
		futureX.push((d.getTime() - baseMs) / 86_400_000);
	}

	const trend: TrendPoint[] = [
		...historicalX.map((x, i) => ({ label: months[i], value: predict(model, { [TREND_TIME_FEATURE]: x }) })),
		...futureX.map((x, i) => ({ label: futureLabels[i], value: predict(model, { [TREND_TIME_FEATURE]: x }) }))
	];
	const historicalPadded: TrendPoint[] = [
		...historical,
		...futureLabels.map((label, i) => ({ label, value: trend[months.length + i].value }))
	];

	return { historical: historicalPadded, trend, historicalCount: months.length };
}
