import { describe, it, expect } from 'vitest';
import { computeSensitivity } from './sensitivity';
import type { LinearRegressionModel } from './types';

function makeModel(): LinearRegressionModel {
	return {
		method: 'linear_regression',
		targetColumn: 'sales',
		featureColumns: ['ad_spend', 'store_visits', 'price'],
		intercept: 100,
		// ad_spend: large impact (coefficient 10, wide range), store_visits: medium impact, price: small impact (narrow range)
		coefficients: [10, 2, -1],
		metrics: { sampleSize: 20, r2: 0.9, adjustedR2: 0.88, residualStdError: 5 },
		featureRanges: {
			ad_spend: { min: 0, max: 100, mean: 50 },
			store_visits: { min: 0, max: 200, mean: 100 },
			price: { min: 90, max: 110, mean: 100 }
		}
	};
}

describe('computeSensitivity', () => {
	it('sorts features by predicted-value swing, largest first', () => {
		const items = computeSensitivity(makeModel());
		expect(items.map((i) => i.key)).toEqual(['ad_spend', 'store_visits', 'price']);
	});

	it('computes low/high around the base prediction using each feature min/max', () => {
		const items = computeSensitivity(makeModel());
		const adSpend = items.find((i) => i.key === 'ad_spend')!;
		// base = 100 + 10*50 + 2*100 - 1*100 = 700
		expect(adSpend.base).toBeCloseTo(700, 6);
		// min(ad_spend=0) -> 700 - 10*50 = 200, max(ad_spend=100) -> 700 + 10*50 = 1200
		expect(adSpend.low).toBeCloseTo(200, 6);
		expect(adSpend.high).toBeCloseTo(1200, 6);
	});

	it('handles a negative coefficient by still returning low <= high', () => {
		const items = computeSensitivity(makeModel());
		const price = items.find((i) => i.key === 'price')!;
		expect(price.low).toBeLessThanOrEqual(price.high);
	});
});
