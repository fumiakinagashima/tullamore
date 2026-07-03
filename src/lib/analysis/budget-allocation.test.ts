import { describe, it, expect } from 'vitest';
import { optimizeBudgetAllocation, defaultChannelBounds, type ChannelBounds } from './budget-allocation';
import type { LinearRegressionModel } from './types';

function makeModel(): LinearRegressionModel {
	return {
		method: 'linear_regression',
		targetColumn: 'sales',
		featureColumns: ['tv_ad', 'sns_ad'],
		intercept: 100,
		coefficients: [10, 2],
		metrics: { sampleSize: 20, r2: 0.9, adjustedR2: 0.88, residualStdError: 5 },
		featureRanges: {
			tv_ad: { min: 0, max: 100, mean: 50 },
			sns_ad: { min: 0, max: 200, mean: 100 }
		}
	};
}

const EPS = 1e-9;

describe('optimizeBudgetAllocation', () => {
	it('allocates greedily to the higher-coefficient channel first, within bounds', () => {
		const model = makeModel();
		const bounds: Record<string, ChannelBounds> = {
			tv_ad: { min: 0, max: 100 },
			sns_ad: { min: 0, max: 200 }
		};
		const result = optimizeBudgetAllocation(model, ['tv_ad', 'sns_ad'], 120, bounds, EPS);

		expect(result.infeasible).toBe(false);
		expect(result.channels.find((c) => c.key === 'tv_ad')!.allocated).toBeCloseTo(100); // maxed out first (coef 10)
		expect(result.channels.find((c) => c.key === 'sns_ad')!.allocated).toBeCloseTo(20); // remainder
		// predictedOptimal = 100 + 10*100 + 2*20 = 1140
		expect(result.predictedOptimal).toBeCloseTo(1140);
		// predictedCurrent (means: 50, 100) = 100 + 10*50 + 2*100 = 800
		expect(result.predictedCurrent).toBeCloseTo(800);
		expect(result.uplift).toBeCloseTo(340);
	});

	it('respects per-channel minimums before distributing the remainder', () => {
		const model = makeModel();
		const bounds: Record<string, ChannelBounds> = {
			tv_ad: { min: 10, max: 100 },
			sns_ad: { min: 10, max: 200 }
		};
		const result = optimizeBudgetAllocation(model, ['tv_ad', 'sns_ad'], 50, bounds, EPS);

		expect(result.infeasible).toBe(false);
		// starts at mins (10, 10), remaining = 30 all goes to tv_ad (higher coef) up to its max room (90)
		expect(result.channels.find((c) => c.key === 'tv_ad')!.allocated).toBeCloseTo(40);
		expect(result.channels.find((c) => c.key === 'sns_ad')!.allocated).toBeCloseTo(10);
		const sum = result.channels.reduce((s, c) => s + c.allocated, 0);
		expect(sum).toBeCloseTo(50);
	});

	it('marks infeasible and scales down proportionally when budget is below the sum of minimums', () => {
		const model = makeModel();
		const bounds: Record<string, ChannelBounds> = {
			tv_ad: { min: 20, max: 100 },
			sns_ad: { min: 30, max: 200 }
		};
		const result = optimizeBudgetAllocation(model, ['tv_ad', 'sns_ad'], 30, bounds, EPS);

		expect(result.infeasible).toBe(true);
		const tv = result.channels.find((c) => c.key === 'tv_ad')!.allocated;
		const sns = result.channels.find((c) => c.key === 'sns_ad')!.allocated;
		expect(tv + sns).toBeCloseTo(30);
		expect(tv).toBeCloseTo(12); // 20 * (30/50)
		expect(sns).toBeCloseTo(18); // 30 * (30/50)
	});

	it('marks infeasible and dumps the overflow into the best channel when budget exceeds the sum of maximums', () => {
		const model = makeModel();
		const bounds: Record<string, ChannelBounds> = {
			tv_ad: { min: 0, max: 100 },
			sns_ad: { min: 0, max: 200 }
		};
		const result = optimizeBudgetAllocation(model, ['tv_ad', 'sns_ad'], 500, bounds, EPS);

		expect(result.infeasible).toBe(true);
		expect(result.channels.find((c) => c.key === 'tv_ad')!.allocated).toBeCloseTo(300); // 100 max + 200 overflow
		expect(result.channels.find((c) => c.key === 'sns_ad')!.allocated).toBeCloseTo(200);
	});

	it('flags near-zero coefficients as negligible', () => {
		const model = makeModel();
		model.coefficients = [10, 0];
		const bounds: Record<string, ChannelBounds> = {
			tv_ad: { min: 0, max: 100 },
			sns_ad: { min: 0, max: 200 }
		};
		const result = optimizeBudgetAllocation(model, ['tv_ad', 'sns_ad'], 120, bounds, 1e-6);
		expect(result.channels.find((c) => c.key === 'sns_ad')!.isNegligible).toBe(true);
		expect(result.channels.find((c) => c.key === 'tv_ad')!.isNegligible).toBe(false);
	});
});

describe('defaultChannelBounds', () => {
	it('uses the observed min/max, clamped to non-negative', () => {
		const model = makeModel();
		expect(defaultChannelBounds(model, 'tv_ad')).toEqual({ min: 0, max: 100 });
	});

	it('clamps a negative observed minimum up to 0', () => {
		const model = makeModel();
		model.featureRanges.tv_ad = { min: -5, max: 100, mean: 50 };
		expect(defaultChannelBounds(model, 'tv_ad')).toEqual({ min: 0, max: 100 });
	});
});
