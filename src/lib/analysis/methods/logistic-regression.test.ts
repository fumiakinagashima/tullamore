import { describe, it, expect } from 'vitest';
import {
	fitLogisticRegression,
	predictLogisticRegression,
	assessClassificationValidity,
	type LogisticRegressionRow,
	type LogisticRegressionModel
} from './logistic-regression';
import { createSeededRng } from '../monte-carlo';

const OPTS = { maxIterations: 50, tolerance: 1e-6 };

describe('fitLogisticRegression', () => {
	it('matches the classic "hours studied vs exam pass" textbook example', () => {
		// Well-known worked example (hours of study -> pass/fail). Known reference coefficients
		// are roughly intercept ≈ -4.08, hours ≈ 1.50 — we check the fit lands in the right
		// ballpark rather than pinning exact literature values.
		const hours = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 4, 4.25, 4.5, 4.75, 5, 5.5];
		const pass = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1];
		const rows: LogisticRegressionRow[] = hours.map((h, i) => ({ features: [h], target: pass[i] as 0 | 1 }));

		const model = fitLogisticRegression(rows, 'pass', ['hours'], 'pass', OPTS);

		expect(model.metrics.converged).toBe(true);
		expect(model.coefficients[0]).toBeGreaterThan(0.8);
		expect(model.coefficients[0]).toBeLessThan(2.5);
		expect(model.intercept).toBeLessThan(-2);
		expect(model.intercept).toBeGreaterThan(-7);

		// monotonicity: more study hours -> higher predicted probability of passing
		const pLow = predictLogisticRegression(model, { hours: 0.5 });
		const pHigh = predictLogisticRegression(model, { hours: 5.5 });
		expect(pLow).toBeLessThan(0.5);
		expect(pHigh).toBeGreaterThan(0.5);
		expect(pHigh).toBeGreaterThan(pLow);
	});

	it('recovers roughly correct coefficients on synthetic data generated from a known logistic model', () => {
		const rng = createSeededRng(42);
		const trueIntercept = -1;
		const trueCoefX1 = 0.8;
		const trueCoefX2 = -0.5;

		const rows: LogisticRegressionRow[] = [];
		for (let i = 0; i < 400; i++) {
			const x1 = rng() * 10;
			const x2 = rng() * 10;
			const p = 1 / (1 + Math.exp(-(trueIntercept + trueCoefX1 * x1 + trueCoefX2 * x2)));
			const target = rng() < p ? 1 : 0;
			rows.push({ features: [x1, x2], target });
		}

		const model = fitLogisticRegression(rows, 'y', ['x1', 'x2'], 'yes', OPTS);

		expect(model.metrics.converged).toBe(true);
		expect(model.coefficients[0]).toBeGreaterThan(0); // same sign as trueCoefX1
		expect(model.coefficients[1]).toBeLessThan(0); // same sign as trueCoefX2
		expect(model.coefficients[0]).toBeCloseTo(trueCoefX1, 0); // within ~0.5
		expect(model.coefficients[1]).toBeCloseTo(trueCoefX2, 0);
		expect(model.metrics.pseudoR2).toBeGreaterThan(0.1);
		expect(model.metrics.accuracy).toBeGreaterThan(0.6);

		const { truePositive, falsePositive, trueNegative, falseNegative } = model.confusionMatrix;
		expect(truePositive + falsePositive + trueNegative + falseNegative).toBe(400);
	});

	it('throws when the target is constant (no positive/negative split)', () => {
		const rows: LogisticRegressionRow[] = Array.from({ length: 10 }, (_, i) => ({ features: [i], target: 1 as const }));
		expect(() => fitLogisticRegression(rows, 'y', ['x'], 'yes', OPTS)).toThrow();
	});

	it('throws when sample size is insufficient relative to feature count', () => {
		const rows: LogisticRegressionRow[] = [
			{ features: [1, 2], target: 0 },
			{ features: [2, 3], target: 1 }
		];
		expect(() => fitLogisticRegression(rows, 'y', ['x1', 'x2'], 'yes', OPTS)).toThrow();
	});
});

describe('assessClassificationValidity', () => {
	function makeModel(overrides: Partial<LogisticRegressionModel> = {}): LogisticRegressionModel {
		return {
			method: 'logistic_regression',
			targetColumn: 'y',
			featureColumns: ['x1', 'x2'],
			positiveClassLabel: '1',
			intercept: -1,
			coefficients: [0.5, -0.3],
			metrics: { sampleSize: 200, accuracy: 0.85, precision: 0.8, recall: 0.75, f1: 0.77, pseudoR2: 0.3, iterations: 8, converged: true },
			confusionMatrix: { truePositive: 70, falsePositive: 15, trueNegative: 100, falseNegative: 15 },
			featureRanges: { x1: { min: 0, max: 10, mean: 5 }, x2: { min: 0, max: 10, mean: 5 } },
			...overrides
		};
	}

	it('rates good for a well-fit, converged, balanced model', () => {
		const validity = assessClassificationValidity(makeModel());
		expect(validity.overallLevel).toBe('good');
	});

	it('uses McFadden thresholds (0.2-0.4 is good), not linear-regression R² thresholds', () => {
		const validity = assessClassificationValidity(makeModel({ metrics: { sampleSize: 200, accuracy: 0.85, precision: 0.8, recall: 0.75, f1: 0.77, pseudoR2: 0.25, iterations: 8, converged: true } }));
		const fitCheck = validity.checks.find((c) => c.label === 'Goodness of fit');
		expect(fitCheck?.level).toBe('good');
	});

	it('flags poor when the model did not converge', () => {
		const validity = assessClassificationValidity(
			makeModel({ metrics: { sampleSize: 200, accuracy: 0.6, precision: 0.5, recall: 0.5, f1: 0.5, pseudoR2: 0.3, iterations: 50, converged: false } })
		);
		expect(validity.overallLevel).toBe('poor');
		expect(validity.checks.some((c) => c.label === 'Training convergence' && c.level === 'poor')).toBe(true);
	});

	it('flags poor class balance for a heavily skewed target', () => {
		const validity = assessClassificationValidity(
			makeModel({ confusionMatrix: { truePositive: 2, falsePositive: 1, trueNegative: 190, falseNegative: 7 } })
		);
		expect(validity.checks.some((c) => c.label === 'Class balance' && c.level === 'poor')).toBe(true);
	});
});

describe('predictLogisticRegression', () => {
	it('returns 0.5 when the linear predictor is exactly 0', () => {
		const model = {
			method: 'logistic_regression' as const,
			targetColumn: 'y',
			featureColumns: ['x'],
			positiveClassLabel: 'yes',
			intercept: 0,
			coefficients: [0],
			metrics: { sampleSize: 1, accuracy: 1, precision: 1, recall: 1, f1: 1, pseudoR2: 1, iterations: 1, converged: true },
			confusionMatrix: { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 },
			featureRanges: { x: { min: 0, max: 1, mean: 0.5 } }
		};
		expect(predictLogisticRegression(model, { x: 100 })).toBeCloseTo(0.5, 9);
	});
});
