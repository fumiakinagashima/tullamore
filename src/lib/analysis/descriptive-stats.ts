import { percentile, buildHistogram, type HistogramBin } from './stats-utils';
import { combineOverall, type ValidityAssessment, type ValidityCheckItem } from './validity';

/** SQL集計から得られる、1列分の正確なサマリー統計量（生データ不要） */
export type ColumnAggregates = { n: number; sum: number; sumSq: number; min: number; max: number };

export type DescriptiveStatsSummary = {
	n: number;
	mean: number;
	stddev: number;
	min: number;
	max: number;
	median: number;
	q1: number;
	q3: number;
	iqr: number;
	histogram: HistogramBin[];
	/** 中央値・四分位数・ヒストグラムの算出に使ったサンプル件数（n以下） */
	sampleSize: number;
	/** サンプル件数が母集団件数(n)未満で打ち切られた場合true。中央値等はこの場合近似値 */
	sampled: boolean;
	/** IQR方式（[Q1-1.5×IQR, Q3+1.5×IQR]の外）で数えた外れ値候補の件数（サンプル内） */
	outlierCount: number;
	validity: ValidityAssessment;
};

/**
 * n/mean/stddev/min/maxはSQL集計値（aggregates）から正確に計算する
 * （Σ(x-mean)² = Σx² - n*mean² の恒等式を使い、生データを読まずに分散が求まる）。
 * 中央値・四分位数・ヒストグラムは生データのサンプル（sample、上限付き）からのみ計算できるため近似値になりうる。
 */
export function computeDescriptiveStats(
	aggregates: ColumnAggregates,
	sample: number[],
	histogramBins: number
): DescriptiveStatsSummary {
	const { n, sum, sumSq, min, max } = aggregates;
	const mean = sum / n;
	const variance = n > 1 ? Math.max(0, sumSq - n * mean * mean) / (n - 1) : 0;
	const stddev = Math.sqrt(variance);

	const sorted = [...sample].sort((a, b) => a - b);
	const median = percentile(sorted, 50);
	const q1 = percentile(sorted, 25);
	const q3 = percentile(sorted, 75);
	const iqr = q3 - q1;
	const histogram = buildHistogram(sample, min, max, histogramBins);

	const lowerFence = q1 - 1.5 * iqr;
	const upperFence = q3 + 1.5 * iqr;
	const outlierCount = sample.filter((v) => v < lowerFence || v > upperFence).length;

	const sampled = sample.length < n;
	const checks: ValidityCheckItem[] = [];
	if (n >= 30) {
		checks.push({ label: 'サンプル数', level: 'good', comment: `件数${n}件は分布の把握に十分です` });
	} else if (n >= 10) {
		checks.push({ label: 'サンプル数', level: 'caution', comment: `件数${n}件はやや少なく、分布の解釈には注意が必要です（目安: 30件以上）` });
	} else {
		checks.push({ label: 'サンプル数', level: 'poor', comment: `件数${n}件は不足しており、統計量の信頼性が低い可能性があります（目安: 30件以上）` });
	}
	if (sampled) {
		checks.push({
			label: '中央値・四分位数の精度',
			level: 'caution',
			comment: `全${n.toLocaleString()}件のうち先頭${sample.length.toLocaleString()}件のサンプルに基づく近似値です`
		});
	}
	const { overallLevel, overallComment } = combineOverall(checks, 'この統計量は妥当性チェックの主要な観点で問題は見つかりませんでした');

	return {
		n,
		mean,
		stddev,
		min,
		max,
		median,
		q1,
		q3,
		iqr,
		histogram,
		sampleSize: sample.length,
		sampled,
		outlierCount,
		validity: { overallLevel, overallComment, checks }
	};
}
