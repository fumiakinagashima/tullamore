import { describe, it, expect } from 'vitest';
import { reviewSimulator } from './review';
import type { LinearRegressionModel } from '$lib/analysis/types';

function makeModel(overrides: Partial<LinearRegressionModel> = {}): LinearRegressionModel {
	return {
		method: 'linear_regression',
		targetColumn: 'y',
		featureColumns: ['x'],
		intercept: 1,
		coefficients: [2],
		metrics: { sampleSize: 100, r2: 0.9, adjustedR2: 0.89, residualStdError: 1 },
		featureRanges: { x: { min: 0, max: 10, mean: 5 } },
		...overrides
	};
}

// With a single feature column, the multicollinearity check doesn't run and D1 is never queried, so a stub is sufficient
const unusedDb = {} as D1Database;

describe('reviewSimulator', () => {
	it('reports excellent fit and sufficient sample size for a strong model', async () => {
		const model = makeModel({ metrics: { sampleSize: 100, r2: 0.9, adjustedR2: 0.89, residualStdError: 1 } });
		const review = await reviewSimulator(unusedDb, 'ds_test', model);
		expect(review.fitQuality).toBe('excellent');
		expect(review.sampleSizeAdequacy).toBe('sufficient');
		expect(review.multicollinearity).toBeNull();
	});

	it('reports weak fit for a low R²', async () => {
		const model = makeModel({ metrics: { sampleSize: 100, r2: 0.15, adjustedR2: 0.1, residualStdError: 5 } });
		const review = await reviewSimulator(unusedDb, 'ds_test', model);
		expect(review.fitQuality).toBe('weak');
		expect(review.overallComment).toContain('reference only');
	});

	it('reports insufficient sample size for too few rows relative to feature count', async () => {
		const model = makeModel({
			featureColumns: ['x'],
			coefficients: [2],
			metrics: { sampleSize: 5, r2: 0.9, adjustedR2: 0.85, residualStdError: 1 }
		});
		const review = await reviewSimulator(unusedDb, 'ds_test', model);
		expect(review.sampleSizeAdequacy).toBe('insufficient');
	});
});
