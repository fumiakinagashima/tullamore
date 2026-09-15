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
	/** When true, adds noise derived from the residual standard error (model.metrics.residualStdError) to the predict() result */
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

/** Builds a default uniform distribution from the feature variable range (featureRanges) */
export function defaultDistribution(range: FeatureRange): FeatureDistribution {
	if (range.max <= range.min) return { kind: 'fixed', value: range.mean };
	return { kind: 'uniform', min: range.min, max: range.max };
}

/** mulberry32. A deterministic pseudo-random number generator for tests (production uses Math.random) */
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

/** Box-Muller method. Retries if rng() returns 0, to avoid log(0) */
export function sampleNormal(rng: () => number, mean: number, stddev: number): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = rng();
	while (v === 0) v = rng();
	const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	return mean + z * stddev;
}

/** Triangular distribution sampling via inverse transform sampling */
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
 * Draws N samples from the distribution of each feature variable, repeatedly calling predict()
 * and returning an array of realized target variable values.
 * Feature variables not specified in `distributions` are held fixed at the mean value from featureRanges.
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
