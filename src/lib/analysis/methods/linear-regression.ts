import { Matrix, solve } from 'ml-matrix';
import type { FeatureRange, LinearRegressionModel, RegressionMetrics, SufficientStats } from '../types';

function crossSum(stats: SufficientStats, a: string, b: string): number {
	if (a === b) return stats.featureCrossSums[a]?.[a] ?? 0;
	return stats.featureCrossSums[a]?.[b] ?? stats.featureCrossSums[b]?.[a] ?? 0;
}

export function fitLinearRegression(
	stats: SufficientStats,
	targetColumn: string,
	featureColumns: string[]
): LinearRegressionModel {
	const k = featureColumns.length;
	if (k === 0) throw new Error('説明変数が指定されていません');
	if (stats.n <= k) {
		throw new Error(`サンプル数（${stats.n}件）が説明変数の数（${k}個）以下のため、モデルを学習できません`);
	}

	// XᵀX・Xᵀy を構築する（先頭行・列が切片項）
	const size = k + 1;
	const xtx = Matrix.zeros(size, size);
	const xty = Matrix.zeros(size, 1);

	xtx.set(0, 0, stats.n);
	xty.set(0, 0, stats.targetSum);
	for (let i = 0; i < k; i++) {
		const col = featureColumns[i];
		xtx.set(0, i + 1, stats.featureSums[col]);
		xtx.set(i + 1, 0, stats.featureSums[col]);
		xty.set(i + 1, 0, stats.featureTargetSums[col]);
		for (let j = 0; j < k; j++) {
			xtx.set(i + 1, j + 1, crossSum(stats, col, featureColumns[j]));
		}
	}

	let beta: Matrix;
	try {
		// useSVD=true: 説明変数間の相関が強い（多重共線性）場合でも最小二乗解を返す
		beta = solve(xtx, xty, true);
	} catch {
		throw new Error('モデルの学習に失敗しました（説明変数間の相関が強すぎる可能性があります）');
	}

	const intercept = beta.get(0, 0);
	const coefficients = featureColumns.map((_, i) => beta.get(i + 1, 0));
	if (!Number.isFinite(intercept) || coefficients.some((c) => !Number.isFinite(c))) {
		throw new Error('モデルの学習に失敗しました（説明変数間の相関が強すぎる可能性があります）');
	}

	// SSE = yᵀy - βᵀ(Xᵀy)（β は正規方程式の解であるため βᵀXᵀXβ = βᵀXᵀy が成り立つことを利用）
	let betaDotXty = intercept * stats.targetSum;
	for (let i = 0; i < k; i++) betaDotXty += coefficients[i] * stats.featureTargetSums[featureColumns[i]];
	const sse = Math.max(stats.targetSumSq - betaDotXty, 0);

	const targetMean = stats.targetSum / stats.n;
	const sst = Math.max(stats.targetSumSq - stats.n * targetMean * targetMean, 0);
	const r2 = sst > 0 ? 1 - sse / sst : 0;

	const dof = stats.n - k - 1;
	const adjustedR2 = dof > 0 ? 1 - ((1 - r2) * (stats.n - 1)) / dof : r2;
	const residualStdError = dof > 0 ? Math.sqrt(sse / dof) : 0;

	const metrics: RegressionMetrics = { sampleSize: stats.n, r2, adjustedR2, residualStdError };

	const featureRanges: Record<string, FeatureRange> = {};
	for (const col of featureColumns) {
		featureRanges[col] = {
			min: stats.featureMin[col],
			max: stats.featureMax[col],
			mean: stats.featureSums[col] / stats.n
		};
	}

	return { method: 'linear_regression', targetColumn, featureColumns, intercept, coefficients, metrics, featureRanges };
}

/**
 * 保存済みモデルの係数から予測値を計算する純粋関数。D1等への依存を持たないため、
 * サーバー（レビュー等）とクライアント（フロントエンドのリアルタイム再計算）の両方から使える。
 */
export function predictLinearRegression(model: LinearRegressionModel, vars: Record<string, number>): number {
	let y = model.intercept;
	for (let i = 0; i < model.featureColumns.length; i++) {
		const col = model.featureColumns[i];
		const v = vars[col];
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			throw new Error(`変数 ${col} の値が指定されていません`);
		}
		y += model.coefficients[i] * v;
	}
	return y;
}
