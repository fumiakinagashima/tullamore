import type { LinearRegressionModel } from './types';

export type GoalSeekResult = {
	value: number;
	isOutOfRange: boolean;
};

/**
 * Solves backward for what targetFeature needs to be for the target variable to equal
 * targetValue. Other feature variables are held fixed at fixedValues (or their mean if omitted).
 * Since this is a linear combination, it can be solved in closed form.
 * Returns null when it can't be solved because targetFeature's coefficient is nearly 0
 * (i.e. it has no effect on the target variable).
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
