import type { AnalysisMethod, Model, SufficientStats } from './types';
import { fitLinearRegression, predictLinearRegression } from './methods/linear-regression';

type MethodImpl = {
	fit: (stats: SufficientStats, targetColumn: string, featureColumns: string[]) => Model;
	predict: (model: Model, vars: Record<string, number>) => number;
};

// Register implementations here when adding new analysis methods (methods other than linear combination are currently out of scope)
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

/** Computes a predicted value from a saved model. A pure function with no dependency on D1 etc., so it can also be used client-side. */
export function predict(model: Model, vars: Record<string, number>): number {
	return analysisMethodRegistry[model.method].predict(model, vars);
}
