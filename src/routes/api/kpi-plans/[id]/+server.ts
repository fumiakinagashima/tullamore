import { json } from '@sveltejs/kit';
import { z } from 'zod/v4';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getKpiPlan, updateKpiPlan, deleteKpiPlan } from '$lib/server/db/kpi-service';
import { errors } from '$lib/server/errors';

const bodySchema = z.object({
	name: z.string().min(1),
	dataSourceId: z.string(),
	targetColumn: z.string(),
	periodLabel: z.string().min(1),
	periodType: z.enum(['year', 'month', 'week', 'custom']),
	dateColumn: z.string().min(1).nullable().optional(),
	periodFrom: z.string().min(1).nullable().optional(),
	periodTo: z.string().min(1).nullable().optional(),
	snapshot: z.record(z.string(), z.unknown())
});

export const PUT: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const plan = await getKpiPlan(db, params.id);
	if (!plan) return errors.notFound('KPIプランが見つかりません');

	const body = bodySchema.parse(await request.json());
	const updated = await updateKpiPlan(db, params.id, {
		name: body.name,
		dataSourceId: body.dataSourceId,
		targetColumn: body.targetColumn,
		periodLabel: body.periodLabel,
		periodType: body.periodType,
		dateColumn: body.dateColumn ?? null,
		periodFrom: body.periodFrom ?? null,
		periodTo: body.periodTo ?? null,
		planJson: JSON.stringify(body.snapshot)
	});
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const plan = await getKpiPlan(db, params.id);
	if (!plan) return errors.notFound('KPIプランが見つかりません');

	await deleteKpiPlan(db, params.id);
	return json({ ok: true });
};
