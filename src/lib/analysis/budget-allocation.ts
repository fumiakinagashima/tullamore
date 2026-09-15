import type { LinearRegressionModel } from './types';
import { predict } from './registry';

export type ChannelBounds = { min: number; max: number };

export type ChannelAllocation = {
	key: string;
	/** Regression coefficient (increment in the outcome variable per one unit of budget added to this channel) */
	coefficient: number;
	/** Observed average (used as the baseline for the current allocation) */
	current: number;
	/** Allocated amount after optimization */
	allocated: number;
	/** A channel whose coefficient is nearly 0, so increasing its allocation has almost no effect on the outcome variable */
	isNegligible: boolean;
};

export type BudgetAllocationResult = {
	totalBudget: number;
	channels: ChannelAllocation[];
	predictedCurrent: number;
	predictedOptimal: number;
	uplift: number;
	/** True if the total budget doesn't fit within the sum of the channels' lower/upper bounds. The allocation in this case is only a rough approximation */
	infeasible: boolean;
};

/**
 * Treats the linear regression model's coefficients as each channel's marginal effect (increment
 * in the outcome variable per unit of budget), and allocates the total budget within each channel's
 * lower/upper bounds (defaulting to its observed range) to maximize the outcome variable.
 *
 * This is an LP problem — linear objective, interval constraints, and a fixed total (maximize
 * Σ(coef_i * x_i) subject to Σx_i = budget, min_i <= x_i <= max_i) — which can be solved exactly with
 * a greedy approach: first assign every channel its lower bound, then fill the remaining budget into
 * channels in descending order of coefficient, up to their upper bounds. This works because each
 * additional unit of budget to a channel always produces the same constant effect (that channel's
 * coefficient), so it's optimal to simply exhaust the highest-effect channel first. If diminishing
 * (non-linear) returns need to be modeled, a different method should be added in the future.
 */
export function optimizeBudgetAllocation(
	model: LinearRegressionModel,
	channels: string[],
	totalBudget: number,
	bounds: Record<string, ChannelBounds>,
	coefEpsilon: number
): BudgetAllocationResult {
	const coefficientOf = (key: string): number => {
		const idx = model.featureColumns.indexOf(key);
		return idx === -1 ? 0 : model.coefficients[idx];
	};

	const sumMin = channels.reduce((sum, key) => sum + bounds[key].min, 0);
	const sumMax = channels.reduce((sum, key) => sum + bounds[key].max, 0);
	const infeasible = totalBudget < sumMin || totalBudget > sumMax;

	const allocated: Record<string, number> = Object.fromEntries(channels.map((key) => [key, bounds[key].min]));
	const byCoefDesc = [...channels].sort((a, b) => coefficientOf(b) - coefficientOf(a));

	if (totalBudget < sumMin) {
		// If the budget doesn't even cover the sum of the lower bounds, scale the lower bounds down proportionally to fit (for display purposes only)
		const scale = sumMin > 0 ? totalBudget / sumMin : 0;
		for (const key of channels) allocated[key] = bounds[key].min * scale;
	} else if (totalBudget > sumMax) {
		// If the budget exceeds the sum of the upper bounds, assign every channel its upper bound and pile the remainder onto the highest-effect channel
		for (const key of channels) allocated[key] = bounds[key].max;
		const overflow = totalBudget - sumMax;
		if (byCoefDesc.length > 0) allocated[byCoefDesc[0]] += overflow;
	} else {
		let remaining = totalBudget - sumMin;
		for (const key of byCoefDesc) {
			if (remaining <= 0) break;
			const room = bounds[key].max - bounds[key].min;
			const take = Math.min(room, remaining);
			allocated[key] += take;
			remaining -= take;
		}
	}

	const otherFeatureMeans = Object.fromEntries(
		model.featureColumns.filter((key) => !channels.includes(key)).map((key) => [key, model.featureRanges[key].mean])
	);
	const currentVars = {
		...otherFeatureMeans,
		...Object.fromEntries(channels.map((key) => [key, model.featureRanges[key].mean]))
	};
	const optimalVars = { ...otherFeatureMeans, ...allocated };

	const predictedCurrent = predict(model, currentVars);
	const predictedOptimal = predict(model, optimalVars);

	const channelResults: ChannelAllocation[] = channels.map((key) => {
		const coefficient = coefficientOf(key);
		return {
			key,
			coefficient,
			current: model.featureRanges[key].mean,
			allocated: allocated[key],
			isNegligible: Math.abs(coefficient) < coefEpsilon
		};
	});

	return {
		totalBudget,
		channels: channelResults,
		predictedCurrent,
		predictedOptimal,
		uplift: predictedOptimal - predictedCurrent,
		infeasible
	};
}

/** Build the default lower/upper bounds from the explanatory variable's range (featureRanges), clamping the lower bound to be no less than 0 */
export function defaultChannelBounds(model: LinearRegressionModel, key: string): ChannelBounds {
	const range = model.featureRanges[key];
	return { min: Math.max(0, range.min), max: Math.max(range.max, 0) };
}
