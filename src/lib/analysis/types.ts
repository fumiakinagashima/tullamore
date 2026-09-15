// Common types independent of any specific analysis method. Kept free of server-only
// dependencies (D1, etc.) so both server and client can reference them (do not place under src/lib/server/).

export type AnalysisMethod = 'linear_regression';

export type FeatureRange = {
	min: number;
	max: number;
	mean: number;
};

export type RegressionMetrics = {
	sampleSize: number;
	r2: number;
	adjustedR2: number;
	residualStdError: number;
};

export type LinearRegressionModel = {
	method: 'linear_regression';
	targetColumn: string;
	featureColumns: string[];
	intercept: number;
	/** Regression coefficients, in the same order as featureColumns */
	coefficients: number[];
	metrics: RegressionMetrics;
	featureRanges: Record<string, FeatureRange>;
};

export type Model = LinearRegressionModel;

export type ModelSpec = {
	method: AnalysisMethod;
	targetColumn: string;
	featureColumns: string[];
};

/**
 * Summary statistics computed via SQL SUM aggregation. Holds only the values needed to solve
 * the normal equations (OLS), never the raw data rows themselves (so Workers CPU time doesn't scale with data volume).
 */
export type SufficientStats = {
	n: number;
	targetSum: number;
	targetSumSq: number;
	featureSums: Record<string, number>;
	featureTargetSums: Record<string, number>;
	/** [a][b] = Sum(a*b). Only pairs with a<=b (in featureColumns order) are stored; reverse-order lookups are resolved by a helper */
	featureCrossSums: Record<string, Record<string, number>>;
	featureMin: Record<string, number>;
	featureMax: Record<string, number>;
};
