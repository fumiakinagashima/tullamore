import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listKpiPlans } from '$lib/server/db/kpi-service';
import { computeAllKpiAchievements } from '$lib/server/analysis/kpi-achievement';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) return { kpiAchievements: [] };

	const db = createDb(platform.env.DB);
	const kpiAchievements = await computeAllKpiAchievements(db, platform.env.DB, await listKpiPlans(db));

	return { kpiAchievements };
};
