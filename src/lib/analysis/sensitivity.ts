import type { LinearRegressionModel } from './types';
import { predict } from './registry';

export type TornadoItem = {
	key: string;
	low: number;
	high: number;
	base: number;
};

/**
 * Fixes the other feature variables at their mean value and computes the swing in the predicted
 * target variable as only the target variable is moved across its observed range (min/max)
 * (this is the sensitivity analysis / source data for the tornado chart).
 * Returns the items sorted by descending swing (|high - low|).
 */
export function computeSensitivity(model: LinearRegressionModel): TornadoItem[] {
	const means = Object.fromEntries(model.featureColumns.map((k) => [k, model.featureRanges[k].mean]));
	const base = predict(model, means);

	const items = model.featureColumns.map((key) => {
		const range = model.featureRanges[key];
		const atMin = predict(model, { ...means, [key]: range.min });
		const atMax = predict(model, { ...means, [key]: range.max });
		return {
			key,
			low: Math.min(atMin, atMax),
			high: Math.max(atMin, atMax),
			base
		};
	});

	return items.sort((a, b) => b.high - b.low - (a.high - a.low));
}
