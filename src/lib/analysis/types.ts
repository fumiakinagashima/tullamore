// 分析手法に依存しない共通型。サーバー・クライアント両方から参照できるよう
// server-only な依存（D1 等）を持たない（src/lib/server/ 配下には置かない）。

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
	/** featureColumns と同じ順序の回帰係数 */
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
 * SQLのSUM集計で算出するサマリー統計量。正規方程式（OLS）を解くのに必要な値だけを持ち、
 * 元データの行そのものは持たない（データ量に対してWorkersのCPU時間がスケールしないようにするため）。
 */
export type SufficientStats = {
	n: number;
	targetSum: number;
	targetSumSq: number;
	featureSums: Record<string, number>;
	featureTargetSums: Record<string, number>;
	/** [a][b] = Σ(a*b)。a<=b（featureColumns内の並び順）の組のみ保持し、逆順の参照はヘルパーで解決する */
	featureCrossSums: Record<string, Record<string, number>>;
	featureMin: Record<string, number>;
	featureMax: Record<string, number>;
};
