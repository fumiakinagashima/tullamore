import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getKpiPlan, parseKpiPlanSnapshot } from '$lib/server/db/kpi-service';
import { getDataSource, parseSchema } from '$lib/server/db/data-source-service';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = createDb(platform!.env.DB);
	const plan = await getKpiPlan(db, params.id);
	if (!plan) throw error(404, 'KPIプランが見つかりません');

	const snapshot = parseKpiPlanSnapshot(plan.planJson);
	const dataSource = await getDataSource(db, snapshot.dataSourceId);
	const columns = dataSource ? parseSchema(dataSource.schemaJson) : [];

	return {
		plan: {
			id: plan.id,
			name: plan.name,
			periodLabel: plan.periodLabel,
			periodType: plan.periodType,
			createdAt: plan.createdAt
		},
		snapshot,
		columns,
		dataSourceName: dataSource?.name ?? null
	};
};
