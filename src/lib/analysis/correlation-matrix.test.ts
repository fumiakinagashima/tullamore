import { describe, it, expect } from 'vitest';
import { buildCorrelationMatrix } from './correlation-matrix';
import type { SufficientStats } from './types';

function sum(values: number[]): number {
	return values.reduce((a, b) => a + b, 0);
}

/** テスト用に、生データの列（columns[0]がtarget、それ以外がfeatures）からSufficientStatsを組み立てる */
function buildStats(data: Record<string, number[]>, columns: string[]): SufficientStats {
	const target = columns[0];
	const features = columns.slice(1);
	const n = data[target].length;

	const featureSums: Record<string, number> = {};
	const featureTargetSums: Record<string, number> = {};
	const featureCrossSums: Record<string, Record<string, number>> = {};

	features.forEach((f, i) => {
		featureSums[f] = sum(data[f]);
		featureTargetSums[f] = sum(data[f].map((v, k) => v * data[target][k]));
		featureCrossSums[f] = {};
		for (let j = i; j < features.length; j++) {
			const g = features[j];
			featureCrossSums[f][g] = sum(data[f].map((v, k) => v * data[g][k]));
		}
	});

	return {
		n,
		targetSum: sum(data[target]),
		targetSumSq: sum(data[target].map((v) => v * v)),
		featureSums,
		featureTargetSums,
		featureCrossSums,
		featureMin: {},
		featureMax: {}
	};
}

/** リファレンス実装（生データから直接計算するピアソン相関係数） */
function referencePearson(a: number[], b: number[]): number {
	const n = a.length;
	const meanA = sum(a) / n;
	const meanB = sum(b) / n;
	let num = 0;
	let denA = 0;
	let denB = 0;
	for (let i = 0; i < n; i++) {
		num += (a[i] - meanA) * (b[i] - meanB);
		denA += (a[i] - meanA) ** 2;
		denB += (b[i] - meanB) ** 2;
	}
	return num / Math.sqrt(denA * denB);
}

describe('buildCorrelationMatrix', () => {
	it('matches direct Pearson correlation for every pair, including non-pivot pairs', () => {
		const data = {
			a: [1, 2, 3, 4, 5],
			b: [2, 4, 6, 8, 10], // perfectly correlated with a
			c: [5, 3, 4, 1, 2] // roughly anti-correlated with a
		};
		const columns = ['a', 'b', 'c'];
		const stats = buildStats(data, columns);
		const result = buildCorrelationMatrix(stats, columns);

		expect(result.columns).toEqual(columns);
		for (let i = 0; i < columns.length; i++) {
			expect(result.matrix[i][i]).toBeCloseTo(1, 6);
			for (let j = 0; j < columns.length; j++) {
				if (i === j) continue;
				expect(result.matrix[i][j]).toBeCloseTo(referencePearson(data[columns[i] as keyof typeof data], data[columns[j] as keyof typeof data]), 6);
			}
		}
	});

	it('is symmetric', () => {
		const data = { x: [1, 5, 2, 8, 3], y: [2, 1, 9, 3, 4], z: [7, 2, 3, 5, 1] };
		const columns = ['x', 'y', 'z'];
		const stats = buildStats(data, columns);
		const result = buildCorrelationMatrix(stats, columns);
		for (let i = 0; i < columns.length; i++) {
			for (let j = 0; j < columns.length; j++) {
				expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 9);
			}
		}
	});

	it('returns [[1]] for a single column', () => {
		const data = { a: [1, 2, 3] };
		const stats = buildStats(data, ['a']);
		const result = buildCorrelationMatrix(stats, ['a']);
		expect(result.matrix).toEqual([[1]]);
	});
});
