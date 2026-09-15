import type { LinearRegressionModel } from './types';
import type { ValidityAssessment } from './validity';
import { predict } from './registry';

export type KpiItemPlan = {
	key: string;
	coefficient: number;
	/** Observed average (current value) */
	current: number;
	/** Back-calculated target value (always stays within the observed range [min, max]) */
	target: number;
	min: number;
	max: number;
	/** How much this item contributes to reaching the target (in units of the outcome variable, coefficient*(target-current)) */
	contribution: number;
};

export type KpiPlanResult = {
	targetColumn: string;
	targetValue: number;
	/** Predicted value if all KPI candidates are left at their current average */
	baseline: number;
	/** targetValue - baseline */
	gap: number;
	/** Whether the gap to the target can be fully closed within the observed ranges of the selected KPI candidates */
	achievable: boolean;
	/** The portion of the gap actually closeable by the KPI candidates (matches gap if achievable) */
	coveredGap: number;
	items: KpiItemPlan[];
};

/** Snapshot of a persisted KPI plan (holds the trained model, validity check, and back-calculation results in full) */
export type KpiPlanSnapshot = {
	dataSourceId: string;
	targetColumn: string;
	featureColumns: string[];
	targetValue: number;
	model: LinearRegressionModel;
	validity: ValidityAssessment;
	plan: KpiPlanResult;
};

/**
 * From the target value of the outcome variable, back-calculate a target value for each selected
 * KPI candidate (explanatory variable).
 *
 * Because a single outcome variable has multiple explanatory variables, this back-calculation
 * problem is inherently underdetermined (there is no single unique solution). Here we adopt a
 * proportional-allocation rule where "each KPI candidate uses the same fraction of its available
 * headroom within its own observed range" (a deliberately different design choice from the greedy
 * approach used in budget-allocation.ts). A greedy approach (concentrating the whole adjustment on
 * the single most effective variable) tends to produce unrealistic KPIs, such as "raise average
 * order value alone far beyond its observed range." With proportional allocation, no KPI candidate
 * ever exceeds its own observed range, and the target is spread naturally across multiple KPIs.
 *
 * If the target cannot be reached (the gap exceeds the combined headroom of all selected KPI
 * candidates), instead of producing an unrealistic value extrapolated beyond the observed range,
 * this returns the value obtained by using up the full range and sets achievable=false to make the
 * shortfall explicit.
 */
export function planKpis(model: LinearRegressionModel, targetValue: number): KpiPlanResult {
	const means = Object.fromEntries(model.featureColumns.map((k) => [k, model.featureRanges[k].mean]));
	const baseline = predict(model, means);
	const gap = targetValue - baseline;
	const gapSign = Math.sign(gap);

	const coefficientOf = (key: string): number => {
		const idx = model.featureColumns.indexOf(key);
		return idx === -1 ? 0 : model.coefficients[idx];
	};

	if (gapSign === 0) {
		const items = model.featureColumns.map((key) => {
			const range = model.featureRanges[key];
			return { key, coefficient: coefficientOf(key), current: range.mean, target: range.mean, min: range.min, max: range.max, contribution: 0 };
		});
		return { targetColumn: model.targetColumn, targetValue, baseline, gap: 0, achievable: true, coveredGap: 0, items };
	}

	// signedHeadroom: the (signed) headroom within the observed range, in the direction that helps move toward the target
	const signedHeadroomOf = (key: string): number => {
		const c = coefficientOf(key);
		if (c === 0) return 0;
		const range = model.featureRanges[key];
		const increaseHelps = (c > 0) === (gapSign > 0);
		return increaseHelps ? Math.max(0, range.max - range.mean) : -Math.max(0, range.mean - range.min);
	};

	const entries = model.featureColumns.map((key) => {
		const coefficient = coefficientOf(key);
		const signedHeadroom = signedHeadroomOf(key);
		const capacity = Math.abs(coefficient * signedHeadroom);
		return { key, coefficient, signedHeadroom, capacity };
	});

	const totalCapacity = entries.reduce((sum, e) => sum + e.capacity, 0);
	const achievable = totalCapacity >= Math.abs(gap);
	const utilization = totalCapacity > 0 ? Math.min(1, Math.abs(gap) / totalCapacity) : 0;
	const coveredGap = gapSign * utilization * totalCapacity;

	const items: KpiItemPlan[] = entries.map((e) => {
		const range = model.featureRanges[e.key];
		const delta = utilization * e.signedHeadroom;
		const target = range.mean + delta;
		return {
			key: e.key,
			coefficient: e.coefficient,
			current: range.mean,
			target,
			min: range.min,
			max: range.max,
			contribution: e.coefficient * delta
		};
	});

	return { targetColumn: model.targetColumn, targetValue, baseline, gap, achievable, coveredGap, items };
}
