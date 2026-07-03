import type { LinearRegressionModel } from './types';

export type GoalSeekResult = {
	value: number;
	isOutOfRange: boolean;
};

/**
 * 目的変数が targetValue になるために targetFeature がいくつであるべきかを逆算する。
 * 他の説明変数は fixedValues（省略時は平均値）に固定する。線形結合なので閉形式で解ける。
 * targetFeature の係数がほぼ0（目的変数に影響しない）の場合は解けないため null を返す。
 */
export function solveForFeature(
	model: LinearRegressionModel,
	targetValue: number,
	targetFeature: string,
	fixedValues: Record<string, number> = {}
): GoalSeekResult | null {
	const idx = model.featureColumns.indexOf(targetFeature);
	if (idx === -1) return null;

	const coefficient = model.coefficients[idx];
	if (Math.abs(coefficient) < 1e-9) return null;

	const othersSum = model.featureColumns.reduce((sum, key, i) => {
		if (key === targetFeature) return sum;
		const v = fixedValues[key] ?? model.featureRanges[key].mean;
		return sum + model.coefficients[i] * v;
	}, 0);

	const value = (targetValue - model.intercept - othersSum) / coefficient;
	const range = model.featureRanges[targetFeature];
	const isOutOfRange = value < range.min || value > range.max;

	return { value, isOutOfRange };
}
