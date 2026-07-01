import type { AnalysisMethod, Model, SufficientStats } from './types';
import { fitLinearRegression, predictLinearRegression } from './methods/linear-regression';

type MethodImpl = {
	fit: (stats: SufficientStats, targetColumn: string, featureColumns: string[]) => Model;
	predict: (model: Model, vars: Record<string, number>) => number;
};

// 分析手法を追加する際はここに実装を登録する（線形結合以外の手法は現状スコープ外）
export const analysisMethodRegistry: Record<AnalysisMethod, MethodImpl> = {
	linear_regression: {
		fit: fitLinearRegression,
		predict: predictLinearRegression
	}
};

export function fitModel(
	method: AnalysisMethod,
	stats: SufficientStats,
	targetColumn: string,
	featureColumns: string[]
): Model {
	return analysisMethodRegistry[method].fit(stats, targetColumn, featureColumns);
}

/** 保存済みモデルから予測値を計算する。D1等への依存を持たないためクライアントサイドでも使える純粋関数。 */
export function predict(model: Model, vars: Record<string, number>): number {
	return analysisMethodRegistry[model.method].predict(model, vars);
}
