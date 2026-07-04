import type { LinearRegressionModel } from './types';
import type { ValidityAssessment } from './validity';
import { predict } from './registry';

export type KpiItemPlan = {
	key: string;
	coefficient: number;
	/** 実測平均（現状値） */
	current: number;
	/** 逆算した目標値（常に実測レンジ[min, max]の範囲内に収まる） */
	target: number;
	min: number;
	max: number;
	/** この項目が目標達成にどれだけ寄与するか（目的変数の単位で、coefficient*(target-current)） */
	contribution: number;
};

export type KpiPlanResult = {
	targetColumn: string;
	targetValue: number;
	/** 全KPI候補を現状の平均値に据え置いた場合の予測値 */
	baseline: number;
	/** targetValue - baseline */
	gap: number;
	/** 選択したKPI候補の実測レンジ内だけで目標との差を完全に埋められるか */
	achievable: boolean;
	/** 実際にKPI候補で埋められる差分（achievableならgapと一致） */
	coveredGap: number;
	items: KpiItemPlan[];
};

/** 永続化するKPIプランのスナップショット（学習済みモデル・妥当性チェック・逆算結果を丸ごと保持する） */
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
 * 目的変数の目標値から、選択したKPI候補（説明変数）それぞれの目標値を逆算する。
 *
 * 単一の目的変数に対して複数の説明変数があるため、この逆算問題は本質的に不定（解が1通りに決まらない）。
 * ここでは「各KPI候補が、自分の実測レンジ内で使える伸びしろ（ヘッドルーム）のうち同じ割合だけを使う」という
 * 比例配分ルールを採用する（budget-allocation.tsの貪欲法とは意図的に異なる設計選択）。
 * 貪欲法（最も効果の大きい1変数に配分を集中させる）だと、「客単価だけを実測レンジを大きく超えて
 * 引き上げる」ような非現実的なKPIが生成されやすい。比例配分なら、どのKPI候補も自分の実測レンジを
 * 超えることがなく、複数のKPIに無理なく目標が分散される。
 *
 * 目標に届かない場合（gapが選択したKPI候補全体のヘッドルームの合計を超える場合）は、
 * 実測レンジ外まで外挿した非現実的な数値を出す代わりに、レンジ内で最大限使い切った値を示し
 * achievable=false として不足分を明示する。
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

	// signedHeadroom: 目標方向に動かした時に助けになる方向の実測レンジ内の伸びしろ（符号付き）
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
