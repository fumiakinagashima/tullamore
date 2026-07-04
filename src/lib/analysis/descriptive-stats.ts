import { percentile, buildHistogram, type HistogramBin } from './stats-utils';

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
	const histogram = buildHistogram(sample, min, max, histogramBins);

	return {
		n,
		mean,
		stddev,
		min,
		max,
		median,
		q1,
		q3,
		iqr: q3 - q1,
		histogram,
		sampleSize: sample.length,
		sampled: sample.length < n
	};
}
