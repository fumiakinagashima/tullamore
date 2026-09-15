import { describe, it, expect } from 'vitest';
import { fitLinearRegression, predictLinearRegression } from './linear-regression';
import { statsFromRows } from '../test-utils';

describe('fitLinearRegression', () => {
	it('recovers exact coefficients for a noiseless single-variable line', () => {
		// y = 5 + 2x
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 5 + 2 * (i + 1) }));
		const stats = statsFromRows(rows, 'y', ['x']);
		const model = fitLinearRegression(stats, 'y', ['x']);

		expect(model.intercept).toBeCloseTo(5, 6);
		expect(model.coefficients[0]).toBeCloseTo(2, 6);
		expect(model.metrics.r2).toBeCloseTo(1, 6);
		expect(model.metrics.sampleSize).toBe(10);
	});

	it('recovers exact coefficients for a noiseless multiple regression', () => {
		// y = 1 + 2*x1 - 0.5*x2
		const rows = Array.from({ length: 20 }, (_, i) => {
			const x1 = i + 1;
			const x2 = (i % 5) * 3 + 1;
			return { x1, x2, y: 1 + 2 * x1 - 0.5 * x2 };
		});
		const stats = statsFromRows(rows, 'y', ['x1', 'x2']);
		const model = fitLinearRegression(stats, 'y', ['x1', 'x2']);

		expect(model.intercept).toBeCloseTo(1, 5);
		expect(model.coefficients[0]).toBeCloseTo(2, 5);
		expect(model.coefficients[1]).toBeCloseTo(-0.5, 5);
		expect(model.metrics.r2).toBeCloseTo(1, 5);
		expect(model.featureRanges.x1).toEqual({ min: 1, max: 20, mean: 10.5 });
	});

	it('reports a lower R² for noisy data', () => {
		const noise = [0.5, -1.2, 0.8, -0.3, 1.5, -0.7, 0.2, -1.8, 0.9, -0.4];
		const rows = noise.map((n, i) => ({ x: i + 1, y: 5 + 2 * (i + 1) + n }));
		const stats = statsFromRows(rows, 'y', ['x']);
		const model = fitLinearRegression(stats, 'y', ['x']);

		expect(model.metrics.r2).toBeLessThan(1);
		expect(model.metrics.r2).toBeGreaterThan(0.9);
	});

	it('throws when sample size is not greater than the number of features', () => {
		const rows = [{ x1: 1, x2: 2, y: 3 }, { x1: 2, x2: 3, y: 5 }];
		const stats = statsFromRows(rows, 'y', ['x1', 'x2']);
		expect(() => fitLinearRegression(stats, 'y', ['x1', 'x2'])).toThrow(/sample size/);
	});
});

describe('predictLinearRegression', () => {
	it('matches training data for a noiseless model', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 5 + 2 * (i + 1) }));
		const stats = statsFromRows(rows, 'y', ['x']);
		const model = fitLinearRegression(stats, 'y', ['x']);

		expect(predictLinearRegression(model, { x: 15 })).toBeCloseTo(35, 5);
	});

	it('throws when a required variable is missing', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 5 + 2 * (i + 1) }));
		const stats = statsFromRows(rows, 'y', ['x']);
		const model = fitLinearRegression(stats, 'y', ['x']);

		expect(() => predictLinearRegression(model, {})).toThrow(/variable/);
	});
});
