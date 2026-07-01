import { describe, it, expect } from 'vitest';
import { pearsonCorrelation, rankFeaturesByCorrelation, featurePairCorrelation, maxFeaturePairCorrelation } from './correlation';
import { statsFromRows } from './test-utils';

describe('pearsonCorrelation', () => {
	it('returns 1 for a perfectly positively correlated pair', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 2 * (i + 1) + 3 }));
		const stats = statsFromRows(rows, 'y', ['x']);
		expect(pearsonCorrelation(stats, 'x')).toBeCloseTo(1, 6);
	});

	it('returns -1 for a perfectly negatively correlated pair', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: -3 * (i + 1) + 100 }));
		const stats = statsFromRows(rows, 'y', ['x']);
		expect(pearsonCorrelation(stats, 'x')).toBeCloseTo(-1, 6);
	});

	it('returns 0 when a feature has zero variance', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: 5, y: i + 1 }));
		const stats = statsFromRows(rows, 'y', ['x']);
		expect(pearsonCorrelation(stats, 'x')).toBe(0);
	});
});

describe('rankFeaturesByCorrelation', () => {
	it('sorts features by absolute correlation, strongest first', () => {
		const rows = Array.from({ length: 20 }, (_, i) => {
			const idx = i + 1;
			return {
				strong: idx * 2,
				weak: idx + (i % 3 === 0 ? 5 : i % 3 === 1 ? -5 : 0),
				negative: -idx,
				y: idx * 2
			};
		});
		const stats = statsFromRows(rows, 'y', ['strong', 'weak', 'negative']);
		const ranked = rankFeaturesByCorrelation(stats, ['strong', 'weak', 'negative']);

		expect(ranked[0].column).toBe('strong');
		expect(ranked[0].correlation).toBeCloseTo(1, 6);
		expect(ranked.map((r) => r.column)).toContain('negative');
		expect(Math.abs(ranked[0].correlation)).toBeGreaterThanOrEqual(Math.abs(ranked[1].correlation));
		expect(Math.abs(ranked[1].correlation)).toBeGreaterThanOrEqual(Math.abs(ranked[2].correlation));
	});
});

describe('featurePairCorrelation', () => {
	it('detects near-perfect collinearity between two features', () => {
		const rows = Array.from({ length: 15 }, (_, i) => ({ a: i + 1, b: 2 * (i + 1), y: i }));
		const stats = statsFromRows(rows, 'y', ['a', 'b']);
		expect(featurePairCorrelation(stats, 'a', 'b')).toBeCloseTo(1, 6);
	});

	it('returns near-zero for unrelated features', () => {
		const rows = [
			{ a: 1, b: 5, y: 0 }, { a: 2, b: 1, y: 0 }, { a: 3, b: 9, y: 0 },
			{ a: 4, b: 2, y: 0 }, { a: 5, b: 7, y: 0 }, { a: 6, b: 3, y: 0 }
		];
		const stats = statsFromRows(rows, 'y', ['a', 'b']);
		expect(Math.abs(featurePairCorrelation(stats, 'a', 'b'))).toBeLessThan(0.5);
	});
});

describe('maxFeaturePairCorrelation', () => {
	it('finds the most correlated pair among 3+ features', () => {
		const rows = Array.from({ length: 15 }, (_, i) => ({
			a: i + 1,
			b: 2 * (i + 1),
			c: (i % 4) - 2,
			y: i
		}));
		const stats = statsFromRows(rows, 'y', ['a', 'b', 'c']);
		const result = maxFeaturePairCorrelation(stats, ['a', 'b', 'c']);
		expect(result).not.toBeNull();
		expect([result!.columnA, result!.columnB].sort()).toEqual(['a', 'b']);
		expect(Math.abs(result!.correlation)).toBeCloseTo(1, 6);
	});

	it('returns null for a single feature', () => {
		const rows = [{ a: 1, y: 1 }, { a: 2, y: 2 }];
		const stats = statsFromRows(rows, 'y', ['a']);
		expect(maxFeaturePairCorrelation(stats, ['a'])).toBeNull();
	});
});
