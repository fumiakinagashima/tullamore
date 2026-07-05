import type { Db } from '../db';
import type { KpiPlan } from '../db/schema';
import { getDataSource } from '../db/data-source-service';
import { parseKpiPlanSnapshot } from '../db/kpi-service';
import { computeCurrentMean } from './descriptive-stats';

export type KpiAchievement = {
	planId: string;
	name: string;
	periodLabel: string;
	periodType: string;
	targetColumn: string;
	targetValue: number;
	/** 期間（date_column・period_from/to）で絞り込んだ実績から計算したか。falseは期間未設定の旧プランで、全期間の平均を使っている */
	periodScoped: boolean;
	/** 現在値（目的変数列の平均値。periodScopedがtrueなら期間内の行のみが対象） */
	current: number;
	/** current / targetValue（100%を超えることもある） */
	achievementRate: number;
};

/**
 * KPIプラン保存時点のスナップショット（targetValue）に対し、データソースの「今の」平均値を
 * 再取得して達成率を出す。プラン自体は作成時点のモデル・逆算結果のまま不変（達成率だけが都度変わる）。
 * モデルの学習は全期間のデータで行うが（関係性を学ぶには履歴データが必要）、達成率の現在値は
 * date_column・period_from/period_toが設定されていればその期間内の行だけに絞って計算する。
 * データソースが削除済み等で計算できない場合は null を返す（呼び出し側で1件ずつスキップできるように）。
 */
export async function computeKpiAchievement(db: Db, d1: D1Database, plan: KpiPlan): Promise<KpiAchievement | null> {
	try {
		const snapshot = parseKpiPlanSnapshot(plan.planJson);
		const dataSource = await getDataSource(db, snapshot.dataSourceId);
		if (!dataSource) return null;

		const dateRange =
			plan.dateColumn && plan.periodFrom && plan.periodTo
				? { column: plan.dateColumn, from: plan.periodFrom, to: plan.periodTo }
				: undefined;
		const current = await computeCurrentMean(d1, dataSource, snapshot.targetColumn, dateRange);
		const targetValue = snapshot.plan.targetValue;
		return {
			planId: plan.id,
			name: plan.name,
			periodLabel: plan.periodLabel,
			periodType: plan.periodType,
			targetColumn: snapshot.targetColumn,
			targetValue,
			periodScoped: !!dateRange,
			current,
			achievementRate: targetValue !== 0 ? current / targetValue : 0
		};
	} catch {
		return null;
	}
}

export async function computeAllKpiAchievements(db: Db, d1: D1Database, plans: KpiPlan[]): Promise<KpiAchievement[]> {
	const results = await Promise.all(plans.map((p) => computeKpiAchievement(db, d1, p)));
	return results.filter((r): r is KpiAchievement => r !== null);
}
