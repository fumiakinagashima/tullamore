import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import { getDbConnection, updateDbConnection, deleteDbConnection } from '$lib/server/db/db-connection-service';
import { errors } from '$lib/server/errors';

const patchSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().optional()
});

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const row = await getDbConnection(db, params.id);
	if (!row) return errors.notFound();
	return json({ ...row, config: JSON.parse(row.config) });
};

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const existing = await getDbConnection(db, params.id);
	if (!existing) return errors.notFound();

	const body = patchSchema.parse(await request.json());
	await updateDbConnection(db, params.id, {
		...(body.name !== undefined && { name: body.name }),
		...(body.description !== undefined && { description: body.description })
	});
	const row = await getDbConnection(db, params.id);
	return json({ ...row!, config: JSON.parse(row!.config) });
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const existing = await getDbConnection(db, params.id);
	if (!existing) return errors.notFound();
	// db_connections 行のみ削除する。取り込み済みの data_sources / external_table_syncs は
	// CSVインポートと同様「取り込んだデータは連携元が消えても残る」設計のため残す
	await deleteDbConnection(db, params.id);
	return json({ deleted: true });
};
