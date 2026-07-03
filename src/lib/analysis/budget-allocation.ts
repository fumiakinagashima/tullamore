import type { LinearRegressionModel } from './types';
import { predict } from './registry';

export type ChannelBounds = { min: number; max: number };

export type ChannelAllocation = {
	key: string;
	/** 回帰係数（このチャネルへの1単位の予算増加あたりの目的変数の増分） */
	coefficient: number;
	/** 実測平均（現在の配分とみなす基準値） */
	current: number;
	/** 最適化後の配分額 */
	allocated: number;
	/** 係数がほぼ0で、配分を増やしても目的変数にほぼ影響しないチャネル */
	isNegligible: boolean;
};

export type BudgetAllocationResult = {
	totalBudget: number;
	channels: ChannelAllocation[];
	predictedCurrent: number;
	predictedOptimal: number;
	uplift: number;
	/** 予算総額がチャネルの上下限の合計に収まらない場合 true。この場合の配分は目安値 */
	infeasible: boolean;
};

/**
 * 線形回帰モデルの係数を「チャネルごとの限界効果（予算1単位あたりの目的変数の増分）」とみなし、
 * 予算総額を各チャネルの上下限（既定は実測レンジ）内に配分して目的変数を最大化する。
 *
 * 線形結合＋区間制約＋合計一定というLP（目的関数 Σ(coef_i * x_i) を Σx_i = budget, min_i <= x_i <= max_i で最大化）は、
 * まず全チャネルを下限まで割り当てた上で、残りの予算を係数の大きいチャネルから順に上限まで詰めていく貪欲法で
 * 厳密に最適解が求まる（各チャネルへの追加1円は常に係数分の一定の効果を生むため、効果が最大のチャネルから
 * 使い切るのが最適という単純な理由による。非線形の逓減効果を織り込みたい場合は将来的に手法を追加する）。
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
		// 下限の合計すら賄えない場合、下限を予算に収まるよう按分する（あくまで目安表示のため）
		const scale = sumMin > 0 ? totalBudget / sumMin : 0;
		for (const key of channels) allocated[key] = bounds[key].min * scale;
	} else if (totalBudget > sumMax) {
		// 上限の合計を超える場合、全チャネルを上限まで割り当て、余りは最も効果の大きいチャネルに積み増す
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

/** 説明変数のレンジ（featureRanges）から、既定の上下限（下限は0未満にならないようクランプ）を組み立てる */
export function defaultChannelBounds(model: LinearRegressionModel, key: string): ChannelBounds {
	const range = model.featureRanges[key];
	return { min: Math.max(0, range.min), max: Math.max(range.max, 0) };
}
