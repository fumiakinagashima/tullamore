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
	/** Whether this was computed from actuals scoped to a period (date_column and period_from/to). False means this is an older plan with no period set, using the all-time average instead */
	periodScoped: boolean;
	/** False if there is no actuals data at all yet for the target period (e.g. right after creating a KPI plan targeting a future period). In that case current/achievementRate are 0 */
	hasActuals: boolean;
	/** Current value (the average of the outcome variable column; if periodScoped is true, scoped to rows within the period; 0 if hasActuals is false) */
	current: number;
	/** current / targetValue (can exceed 100%; 0 if hasActuals is false) */
	achievementRate: number;
};

/**
 * Re-fetches the data source's "current" average against the snapshot (targetValue) taken when the
 * KPI plan was saved, to compute the achievement rate. The plan itself (the model and back-calculation
 * results from creation time) stays unchanged — only the achievement rate is recomputed each time.
 * Model training always uses the full history (learning the relationship requires historical data),
 * but the achievement rate's current value is scoped to rows within date_column / period_from / period_to
 * when those are set. Returns null if it can't be computed (e.g. the data source was deleted), so
 * callers can skip individual plans one at a time.
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
		const hasActuals = current !== null;
		return {
			planId: plan.id,
			name: plan.name,
			periodLabel: plan.periodLabel,
			periodType: plan.periodType,
			targetColumn: snapshot.targetColumn,
			targetValue,
			periodScoped: !!dateRange,
			hasActuals,
			current: hasActuals ? current : 0,
			achievementRate: hasActuals && targetValue !== 0 ? current / targetValue : 0
		};
	} catch {
		return null;
	}
}

export async function computeAllKpiAchievements(db: Db, d1: D1Database, plans: KpiPlan[]): Promise<KpiAchievement[]> {
	const results = await Promise.all(plans.map((p) => computeKpiAchievement(db, d1, p)));
	return results.filter((r): r is KpiAchievement => r !== null);
}
