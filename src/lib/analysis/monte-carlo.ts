import type { FeatureRange, LinearRegressionModel } from './types';
import { predict } from './registry';
import { percentile, buildHistogram, type HistogramBin } from './stats-utils';

export type FeatureDistribution =
	| { kind: 'fixed'; value: number }
	| { kind: 'uniform'; min: number; max: number }
	| { kind: 'normal'; mean: number; stddev: number }
	| { kind: 'triangular'; min: number; max: number; mode: number };

export type MonteCarloOptions = {
	sampleCount: number;
	/** trueの場合、predict()の結果に残差標準誤差（model.metrics.residualStdError）由来のノイズを加える */
	includeResidualNoise: boolean;
	rng?: () => number;
};

export type PercentileEntry = { p: number; value: number };
export type { HistogramBin };

export type MonteCarloSummary = {
	draws: number;
	mean: number;
	stddev: number;
	min: number;
	max: number;
	percentiles: PercentileEntry[];
	histogram: HistogramBin[];
	probabilityAboveThreshold?: number;
};

export type MonteCarloResult = { values: number[]; summary: MonteCarloSummary };

/** 説明変数のレンジ（featureRanges）から、既定の一様分布を組み立てる */
export function defaultDistribution(range: FeatureRange): FeatureDistribution {
	if (range.max <= range.min) return { kind: 'fixed', value: range.mean };
	return { kind: 'uniform', min: range.min, max: range.max };
}

/** mulberry32。決定的なテスト用の擬似乱数生成器（本番はMath.randomを使う） */
export function createSeededRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function sampleUniform(rng: () => number, min: number, max: number): number {
	return min + rng() * (max - min);
}

/** Box-Muller法。rng()が0を返した場合はlog(0)を避けるためリトライする */
export function sampleNormal(rng: () => number, mean: number, stddev: number): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = rng();
	while (v === 0) v = rng();
	const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	return mean + z * stddev;
}

/** 逆変換法による三角分布サンプリング */
export function sampleTriangular(rng: () => number, min: number, max: number, mode: number): number {
	const u = rng();
	const c = (mode - min) / (max - min);
	if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min));
	return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

export function sampleDistribution(dist: FeatureDistribution, rng: () => number): number {
	switch (dist.kind) {
		case 'fixed':
			return dist.value;
		case 'uniform':
			return sampleUniform(rng, dist.min, dist.max);
		case 'normal':
			return sampleNormal(rng, dist.mean, dist.stddev);
		case 'triangular':
			return sampleTriangular(rng, dist.min, dist.max, dist.mode);
	}
}

/**
 * 説明変数ごとの分布からN回サンプリングし、predict()を繰り返して目的変数の実現値の配列を返す。
 * distributionsに指定のない説明変数は、featureRangesの平均値で固定する。
 */
export function drawMonteCarloSamples(
	model: LinearRegressionModel,
	distributions: Record<string, FeatureDistribution>,
	options: MonteCarloOptions
): number[] {
	const rng = options.rng ?? Math.random;
	const values: number[] = new Array(options.sampleCount);

	for (let i = 0; i < options.sampleCount; i++) {
		const vars: Record<string, number> = {};
		for (const key of model.featureColumns) {
			const dist = distributions[key] ?? { kind: 'fixed' as const, value: model.featureRanges[key].mean };
			vars[key] = sampleDistribution(dist, rng);
		}
		let y = predict(model, vars);
		if (options.includeResidualNoise) {
			y += sampleNormal(rng, 0, model.metrics.residualStdError);
		}
		values[i] = y;
	}

	return values;
}

export function summarizeMonteCarlo(
	values: number[],
	opts?: { percentiles?: number[]; histogramBins?: number; threshold?: number }
): MonteCarloSummary {
	const sorted = [...values].sort((a, b) => a - b);
	const n = sorted.length;
	const mean = values.reduce((sum, v) => sum + v, 0) / n;
	const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
	const stddev = Math.sqrt(variance);
	const min = sorted[0];
	const max = sorted[n - 1];

	const percentiles = (opts?.percentiles ?? [10, 25, 50, 75, 90]).map((p) => ({ p, value: percentile(sorted, p) }));

	const binCount = opts?.histogramBins ?? 20;
	const histogram = buildHistogram(values, min, max, binCount);

	const probabilityAboveThreshold =
		opts?.threshold !== undefined ? values.filter((v) => v > opts.threshold!).length / n : undefined;

	return { draws: n, mean, stddev, min, max, percentiles, histogram, probabilityAboveThreshold };
}

export function runMonteCarlo(
	model: LinearRegressionModel,
	distributions: Record<string, FeatureDistribution>,
	options: MonteCarloOptions & { percentiles?: number[]; histogramBins?: number; threshold?: number }
): MonteCarloResult {
	const values = drawMonteCarloSamples(model, distributions, options);
	const summary = summarizeMonteCarlo(values, options);
	return { values, summary };
}
