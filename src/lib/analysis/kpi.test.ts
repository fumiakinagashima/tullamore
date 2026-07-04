import { describe, it, expect } from 'vitest';
import { planKpis } from './kpi';
import type { LinearRegressionModel } from './types';

function makeModel(): LinearRegressionModel {
	return {
		method: 'linear_regression',
		targetColumn: 'sales',
		featureColumns: ['ad_spend', 'visits'],
		intercept: 100,
		coefficients: [10, 2],
		metrics: { sampleSize: 50, r2: 0.9, adjustedR2: 0.88, residualStdError: 5 },
		featureRanges: {
			ad_spend: { min: 0, max: 100, mean: 50 },
			visits: { min: 0, max: 200, mean: 100 }
		}
	};
}

describe('planKpis', () => {
	it('distributes the gap proportionally to each item\'s headroom when feasible', () => {
		const model = makeModel();
		// baseline = 100 + 10*50 + 2*100 = 800; target 1200 -> gap 400
		const result = planKpis(model, 1200);

		expect(result.baseline).toBeCloseTo(800, 6);
		expect(result.gap).toBeCloseTo(400, 6);
		expect(result.achievable).toBe(true);
		expect(result.coveredGap).toBeCloseTo(400, 6);

		// capacity: ad_spend = 10*(100-50)=500, visits = 2*(200-100)=200, total=700
		// utilization = 400/700 = 0.5714...
		const adSpend = result.items.find((i) => i.key === 'ad_spend')!;
		const visits = result.items.find((i) => i.key === 'visits')!;
		expect(adSpend.target).toBeCloseTo(50 + (400 / 700) * 50, 4);
		expect(visits.target).toBeCloseTo(100 + (400 / 700) * 100, 4);

		// both items stay within their historical range
		expect(adSpend.target).toBeLessThanOrEqual(adSpend.max);
		expect(visits.target).toBeLessThanOrEqual(visits.max);

		// contributions sum to the gap
		expect(adSpend.contribution + visits.contribution).toBeCloseTo(400, 4);
	});

	it('caps at each item\'s max and reports achievable=false when the gap exceeds total capacity', () => {
		const model = makeModel();
		// total capacity is 700 (see above); ask for a gap of 1200 (target = baseline + 1200 = 2000)
		const result = planKpis(model, 2000);

		expect(result.achievable).toBe(false);
		expect(result.coveredGap).toBeCloseTo(700, 4); // capped at total capacity
		const adSpend = result.items.find((i) => i.key === 'ad_spend')!;
		const visits = result.items.find((i) => i.key === 'visits')!;
		expect(adSpend.target).toBeCloseTo(adSpend.max, 6);
		expect(visits.target).toBeCloseTo(visits.max, 6);
	});

	it('handles a negative gap (reducing the target) symmetrically', () => {
		const model = makeModel();
		// target below baseline: 800 -> 600, gap = -200
		const result = planKpis(model, 600);

		expect(result.gap).toBeCloseTo(-200, 6);
		expect(result.achievable).toBe(true);
		// capacity to decrease: ad_spend = 10*(50-0)=500, visits = 2*(100-0)=200, total=700
		// utilization = 200/700
		const adSpend = result.items.find((i) => i.key === 'ad_spend')!;
		expect(adSpend.target).toBeCloseTo(50 - (200 / 700) * 50, 4);
		expect(adSpend.target).toBeGreaterThanOrEqual(adSpend.min);
	});

	it('gives a zero-coefficient item zero capacity and leaves it at its current value', () => {
		const model = makeModel();
		model.coefficients = [10, 0];
		const result = planKpis(model, 1200);
		const visits = result.items.find((i) => i.key === 'visits')!;
		expect(visits.target).toBeCloseTo(visits.current, 6);
		expect(visits.contribution).toBeCloseTo(0, 6);
	});

	it('returns the baseline unchanged for every item when the target equals the baseline', () => {
		const model = makeModel();
		const result = planKpis(model, 800);
		expect(result.gap).toBeCloseTo(0, 6);
		expect(result.achievable).toBe(true);
		for (const item of result.items) {
			expect(item.target).toBeCloseTo(item.current, 6);
			expect(item.contribution).toBeCloseTo(0, 6);
		}
	});
});
