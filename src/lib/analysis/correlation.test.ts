import { describe, it, expect } from 'vitest';
import { pearsonCorrelation, rankFeaturesByCorrelation } from './correlation';
import { statsFromRows } from './test-utils';

describe('pearsonCorrelation', () => {
	it('returns 1 for a perfectly positively correlated pair', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 2 * (i + 1) + 3 }));
		const stats = statsFromRows(rows, 'y', ['x']);
		expect(pearsonCorrelation(stats, 'y', 'x')).toBeCloseTo(1, 6);
	});

	it('returns -1 for a perfectly negatively correlated pair', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: -3 * (i + 1) + 100 }));
		const stats = statsFromRows(rows, 'y', ['x']);
		expect(pearsonCorrelation(stats, 'y', 'x')).toBeCloseTo(-1, 6);
	});

	it('returns 0 when a feature has zero variance', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ x: 5, y: i + 1 }));
		const stats = statsFromRows(rows, 'y', ['x']);
		expect(pearsonCorrelation(stats, 'y', 'x')).toBe(0);
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
		const ranked = rankFeaturesByCorrelation(stats, 'y', ['strong', 'weak', 'negative']);

		expect(ranked[0].column).toBe('strong');
		expect(ranked[0].correlation).toBeCloseTo(1, 6);
		expect(ranked.map((r) => r.column)).toContain('negative');
		expect(Math.abs(ranked[0].correlation)).toBeGreaterThanOrEqual(Math.abs(ranked[1].correlation));
		expect(Math.abs(ranked[1].correlation)).toBeGreaterThanOrEqual(Math.abs(ranked[2].correlation));
	});
});
