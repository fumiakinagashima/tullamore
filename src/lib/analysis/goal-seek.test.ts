import { describe, it, expect } from 'vitest';
import { solveForFeature } from './goal-seek';
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

describe('solveForFeature', () => {
	it('solves the exact value needed to hit the target, holding others at their mean', () => {
		// target = 100 + 10*x + 2*100 = 900 -> x = (900 - 100 - 200) / 10 = 60
		const result = solveForFeature(makeModel(), 900, 'ad_spend');
		expect(result).not.toBeNull();
		expect(result!.value).toBeCloseTo(60, 6);
		expect(result!.isOutOfRange).toBe(false);
	});

	it('flags the result as out of range when it falls outside the observed min/max', () => {
		// target = 2000 -> x = (2000 - 100 - 200) / 10 = 170, outside [0, 100]
		const result = solveForFeature(makeModel(), 2000, 'ad_spend');
		expect(result!.isOutOfRange).toBe(true);
	});

	it('respects fixedValues overrides for the other features', () => {
		const result = solveForFeature(makeModel(), 900, 'ad_spend', { store_visits: 50 });
		// target = 100 + 10*x + 2*50 = 900 -> x = (900 - 100 - 100) / 10 = 70
		expect(result!.value).toBeCloseTo(70, 6);
	});

	it('returns null for an unknown feature', () => {
		expect(solveForFeature(makeModel(), 900, 'unknown')).toBeNull();
	});

	it('returns null when the coefficient is ~0 (feature has no effect on target)', () => {
		const model = { ...makeModel(), coefficients: [0, 2] };
		expect(solveForFeature(model, 900, 'ad_spend')).toBeNull();
	});
});
