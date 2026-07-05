import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getKpiPlan, parseKpiPlanSnapshot } from '$lib/server/db/kpi-service';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = createDb(platform!.env.DB);
	const plan = await getKpiPlan(db, params.id);
	if (!plan) throw error(404, 'KPIプランが見つかりません');

	const snapshot = parseKpiPlanSnapshot(plan.planJson);

	return {
		plan: {
			id: plan.id,
			name: plan.name,
			periodLabel: plan.periodLabel,
			periodType: plan.periodType as 'year' | 'month' | 'week' | 'custom',
			dateColumn: plan.dateColumn,
			periodFrom: plan.periodFrom,
			periodTo: plan.periodTo
		},
		snapshot
	};
};
