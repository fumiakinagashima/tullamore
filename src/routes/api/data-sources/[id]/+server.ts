import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import { getDataSource, updateDataSource, deleteDataSource } from '$lib/server/db/data-source-service';
import { errors } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound('Data source not found');
	return json(source);
};

const patchSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().optional()
});

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = patchSchema.parse(await request.json());
	const db = createDb(platform.env.DB);
	await updateDataSource(db, params.id, body);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound('Data source not found');

	await platform.env.DB.prepare(`DROP TABLE IF EXISTS \`${source.tableName}\``).run();
	await deleteDataSource(db, params.id);
	return json({ ok: true });
};
