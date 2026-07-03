import type { LinearRegressionModel } from './types';
import { predict } from './registry';

export type TornadoItem = {
	key: string;
	low: number;
	high: number;
	base: number;
};

/**
 * 他の説明変数を平均値に固定し、対象の変数だけを実測レンジ（min/max）に動かした時の
 * 目的変数の予測値の振れ幅を算出する（感度分析＝トルネードチャートの元データ）。
 * 振れ幅（|high - low|）が大きい順にソートして返す。
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
