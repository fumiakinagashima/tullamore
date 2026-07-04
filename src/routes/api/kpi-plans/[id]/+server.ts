import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getKpiPlan, deleteKpiPlan } from '$lib/server/db/kpi-service';
import { errors } from '$lib/server/errors';

export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const plan = await getKpiPlan(db, params.id);
	if (!plan) return errors.notFound('KPIプランが見つかりません');

	await deleteKpiPlan(db, params.id);
	return json({ ok: true });
};
