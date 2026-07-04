import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listKpiPlans, parseKpiPlanSnapshot } from '$lib/server/db/kpi-service';

export const load: PageServerLoad = async ({ platform }) => {
	const db = createDb(platform!.env.DB);
	const rows = await listKpiPlans(db);
	const plans = rows.map((row) => {
		const snapshot = parseKpiPlanSnapshot(row.planJson);
		return {
			id: row.id,
			name: row.name,
			targetColumn: row.targetColumn,
			periodLabel: row.periodLabel,
			periodType: row.periodType,
			targetValue: snapshot.plan.targetValue,
			achievable: snapshot.plan.achievable,
			createdAt: row.createdAt
		};
	});
	return { plans };
};
