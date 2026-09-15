import { describe, it, expect } from 'vitest';
import { computeDescriptiveStats, type ColumnAggregates } from './descriptive-stats';

function aggregatesOf(values: number[]): ColumnAggregates {
	return {
		n: values.length,
		sum: values.reduce((a, b) => a + b, 0),
		sumSq: values.reduce((a, b) => a + b * b, 0),
		min: Math.min(...values),
		max: Math.max(...values)
	};
}

describe('computeDescriptiveStats', () => {
	it('computes exact mean/stddev/min/max from aggregates on an unsampled dataset', () => {
		const values = [2, 4, 4, 4, 5, 5, 7, 9]; // textbook stddev example, population stddev = 2
		const aggregates = aggregatesOf(values);
		const result = computeDescriptiveStats(aggregates, values, 4);

		expect(result.n).toBe(8);
		expect(result.mean).toBeCloseTo(5, 6);
		// sample stddev (n-1 denominator) for this dataset is ~2.138
		expect(result.stddev).toBeCloseTo(2.138, 2);
		expect(result.min).toBe(2);
		expect(result.max).toBe(9);
		expect(result.sampled).toBe(false);
		expect(result.sampleSize).toBe(8);
	});

	it('computes exact quartiles/median on a known sorted range', () => {
		const values = Array.from({ length: 101 }, (_, i) => i); // 0..100
		const aggregates = aggregatesOf(values);
		const result = computeDescriptiveStats(aggregates, values, 10);

		expect(result.median).toBeCloseTo(50, 6);
		expect(result.q1).toBeCloseTo(25, 6);
		expect(result.q3).toBeCloseTo(75, 6);
		expect(result.iqr).toBeCloseTo(50, 6);
	});

	it('marks sampled=true and reports the smaller sample size when the sample is capped', () => {
		const fullPopulation = Array.from({ length: 1000 }, (_, i) => i);
		const aggregates = aggregatesOf(fullPopulation);
		// simulate a capped fetch: only the first 100 raw values were retrieved
		const sample = fullPopulation.slice(0, 100);
		const result = computeDescriptiveStats(aggregates, sample, 10);

		expect(result.n).toBe(1000); // exact, from aggregates
		expect(result.sampleSize).toBe(100);
		expect(result.sampled).toBe(true);
		// mean/stddev must still come from the exact aggregates, not the biased sample
		expect(result.mean).toBeCloseTo(499.5, 6);
	});

	it('histogram bins sum to the sample size', () => {
		const values = Array.from({ length: 500 }, (_, i) => i);
		const aggregates = aggregatesOf(values);
		const result = computeDescriptiveStats(aggregates, values, 10);
		const total = result.histogram.reduce((a, b) => a + b.count, 0);
		expect(total).toBe(500);
	});

	it('handles n=1 without dividing by zero', () => {
		const values = [42];
		const aggregates = aggregatesOf(values);
		const result = computeDescriptiveStats(aggregates, values, 5);
		expect(result.stddev).toBe(0);
		expect(result.median).toBe(42);
		expect(result.outlierCount).toBe(0);
	});

	it('counts values outside the IQR fences as outliers', () => {
		// tight cluster around 10 plus two clear outliers (-100, 1000)
		const values = [8, 9, 10, 10, 10, 11, 12, -100, 1000];
		const aggregates = aggregatesOf(values);
		const result = computeDescriptiveStats(aggregates, values, 5);
		expect(result.outlierCount).toBe(2);
	});

	it('reports good validity for a large, unsampled dataset', () => {
		const values = Array.from({ length: 50 }, (_, i) => i);
		const aggregates = aggregatesOf(values);
		const result = computeDescriptiveStats(aggregates, values, 10);
		expect(result.validity.overallLevel).toBe('good');
	});

	it('reports poor validity for a very small dataset', () => {
		const values = [1, 2, 3];
		const aggregates = aggregatesOf(values);
		const result = computeDescriptiveStats(aggregates, values, 5);
		expect(result.validity.overallLevel).toBe('poor');
	});

	it('flags the sampling caveat in validity checks when capped', () => {
		const fullPopulation = Array.from({ length: 1000 }, (_, i) => i);
		const aggregates = aggregatesOf(fullPopulation);
		const sample = fullPopulation.slice(0, 100);
		const result = computeDescriptiveStats(aggregates, sample, 10);
		expect(result.validity.checks.some((c) => c.label === 'Median/quartile precision')).toBe(true);
	});
});
