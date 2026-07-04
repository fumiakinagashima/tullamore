import type { SufficientStats } from './types';
import { pearsonCorrelation, featurePairCorrelation } from './correlation';

export type CorrelationMatrix = {
	columns: string[];
	/** matrix[i][j] = columns[i] と columns[j] のピアソン相関係数（対称、対角は1） */
	matrix: number[][];
};

/**
 * columns[0] を「目的変数」、それ以外を「説明変数」として computeSufficientStats を呼んだ結果から、
 * 全列ペアの相関行列を組み立てる。既存のサマリー統計量（Σx, Σxᵢxⱼ 等）だけで求まるため、
 * 新たなSQL集計は不要（columns[0]とのペアは pearsonCorrelation、それ以外のペアは featurePairCorrelation を使う）。
 */
export function buildCorrelationMatrix(stats: SufficientStats, columns: string[]): CorrelationMatrix {
	const n = columns.length;
	const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(1));

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const corr = i === 0 ? pearsonCorrelation(stats, columns[j]) : featurePairCorrelation(stats, columns[i], columns[j]);
			matrix[i][j] = corr;
			matrix[j][i] = corr;
		}
	}

	return { columns, matrix };
}
