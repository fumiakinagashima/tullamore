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
	if (k === 0) throw new Error('No feature variables were specified');
	if (stats.n <= k) {
		throw new Error(`Cannot train the model because the sample size (${stats.n}) is less than or equal to the number of feature variables (${k})`);
	}

	// Build XᵀX and Xᵀy (the first row/column is the intercept term)
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
		// useSVD=true: returns a least-squares solution even when feature variables are strongly correlated (multicollinearity)
		beta = solve(xtx, xty, true);
	} catch {
		throw new Error('Failed to train the model (the feature variables may be too strongly correlated with each other)');
	}

	const intercept = beta.get(0, 0);
	const coefficients = featureColumns.map((_, i) => beta.get(i + 1, 0));
	if (!Number.isFinite(intercept) || coefficients.some((c) => !Number.isFinite(c))) {
		throw new Error('Failed to train the model (the feature variables may be too strongly correlated with each other)');
	}

	// SSE = yᵀy - βᵀ(Xᵀy) (uses the fact that, since β is the solution to the normal equations, βᵀXᵀXβ = βᵀXᵀy holds)
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
 * A pure function that computes a prediction from a saved model's coefficients. Since it has no
 * dependency on D1 etc., it can be used both from the server (review, etc.) and the client
 * (real-time recomputation in the frontend).
 */
export function predictLinearRegression(model: LinearRegressionModel, vars: Record<string, number>): number {
	let y = model.intercept;
	for (let i = 0; i < model.featureColumns.length; i++) {
		const col = model.featureColumns[i];
		const v = vars[col];
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			throw new Error(`No value was provided for variable ${col}`);
		}
		y += model.coefficients[i] * v;
	}
	return y;
}
