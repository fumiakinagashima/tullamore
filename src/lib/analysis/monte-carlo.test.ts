import { describe, it, expect } from 'vitest';
import {
	createSeededRng,
	sampleUniform,
	sampleNormal,
	sampleTriangular,
	summarizeMonteCarlo,
	runMonteCarlo,
	defaultDistribution
} from './monte-carlo';
import type { LinearRegressionModel } from './types';

function makeModel(): LinearRegressionModel {
	return {
		method: 'linear_regression',
		targetColumn: 'sales',
		featureColumns: ['ad_spend', 'store_visits'],
		intercept: 100,
		coefficients: [10, 2],
		metrics: { sampleSize: 20, r2: 0.9, adjustedR2: 0.88, residualStdError: 5 },
		featureRanges: {
			ad_spend: { min: 0, max: 100, mean: 50 },
			store_visits: { min: 0, max: 200, mean: 100 }
		}
	};
}

describe('createSeededRng', () => {
	it('is deterministic for the same seed', () => {
		const rngA = createSeededRng(42);
		const rngB = createSeededRng(42);
		const seqA = Array.from({ length: 10 }, () => rngA());
		const seqB = Array.from({ length: 10 }, () => rngB());
		expect(seqA).toEqual(seqB);
	});

	it('produces values in [0, 1)', () => {
		const rng = createSeededRng(1);
		for (let i = 0; i < 1000; i++) {
			const v = rng();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe('sampleUniform', () => {
	it('stays within [min, max]', () => {
		const rng = createSeededRng(7);
		for (let i = 0; i < 1000; i++) {
			const v = sampleUniform(rng, 10, 20);
			expect(v).toBeGreaterThanOrEqual(10);
			expect(v).toBeLessThan(20);
		}
	});
});

describe('sampleNormal', () => {
	it('has approximately the requested mean/stddev over many draws', () => {
		const rng = createSeededRng(11);
		const n = 20000;
		const values = Array.from({ length: n }, () => sampleNormal(rng, 100, 10));
		const mean = values.reduce((a, b) => a + b, 0) / n;
		const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
		expect(mean).toBeCloseTo(100, -1); // within ~5 of 100
		expect(Math.sqrt(variance)).toBeCloseTo(10, 0);
	});
});

describe('sampleTriangular', () => {
	it('stays within [min, max]', () => {
		const rng = createSeededRng(3);
		for (let i = 0; i < 1000; i++) {
			const v = sampleTriangular(rng, 0, 10, 8);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(10);
		}
	});
});

describe('defaultDistribution', () => {
	it('returns a uniform distribution over min/max when the range has spread', () => {
		const dist = defaultDistribution({ min: 0, max: 100, mean: 50 });
		expect(dist).toEqual({ kind: 'uniform', min: 0, max: 100 });
	});

	it('falls back to fixed at mean when min equals max', () => {
		const dist = defaultDistribution({ min: 5, max: 5, mean: 5 });
		expect(dist).toEqual({ kind: 'fixed', value: 5 });
	});
});

describe('summarizeMonteCarlo', () => {
	it('computes exact percentiles on a known sorted array', () => {
		const values = Array.from({ length: 101 }, (_, i) => i); // 0..100
		const summary = summarizeMonteCarlo(values, { percentiles: [0, 50, 100] });
		expect(summary.percentiles.find((p) => p.p === 0)!.value).toBeCloseTo(0);
		expect(summary.percentiles.find((p) => p.p === 50)!.value).toBeCloseTo(50);
		expect(summary.percentiles.find((p) => p.p === 100)!.value).toBeCloseTo(100);
	});

	it('computes probabilityAboveThreshold correctly', () => {
		const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const summary = summarizeMonteCarlo(values, { threshold: 5 });
		expect(summary.probabilityAboveThreshold).toBeCloseTo(0.5); // 6..10 -> 5/10
	});

	it('histogram bins sum to the total draw count', () => {
		const values = Array.from({ length: 500 }, (_, i) => i);
		const summary = summarizeMonteCarlo(values, { histogramBins: 10 });
		const total = summary.histogram.reduce((a, b) => a + b.count, 0);
		expect(total).toBe(500);
	});
});

describe('runMonteCarlo', () => {
	it('collapses to a single repeated value when all features are fixed and residual noise is off', () => {
		const model = makeModel();
		const result = runMonteCarlo(
			model,
			{ ad_spend: { kind: 'fixed', value: 50 }, store_visits: { kind: 'fixed', value: 100 } },
			{ sampleCount: 100, includeResidualNoise: false, rng: createSeededRng(1) }
		);
		// predicted = 100 + 10*50 + 2*100 = 800
		expect(result.summary.mean).toBeCloseTo(800, 6);
		expect(result.summary.stddev).toBeCloseTo(0, 6);
	});

	it('adds spread when residual noise is enabled', () => {
		const model = makeModel();
		const result = runMonteCarlo(
			model,
			{ ad_spend: { kind: 'fixed', value: 50 }, store_visits: { kind: 'fixed', value: 100 } },
			{ sampleCount: 5000, includeResidualNoise: true, rng: createSeededRng(1) }
		);
		expect(result.summary.stddev).toBeGreaterThan(1);
		expect(result.summary.mean).toBeCloseTo(800, -1);
	});
});
