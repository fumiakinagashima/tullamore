import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import { getDbConnection, updateDbConnection, deleteDbConnection } from '$lib/server/db/db-connection-service';
import { maskAuthConfig, mergeAuthConfig } from '$lib/server/db/integration-service';
import { errors } from '$lib/server/errors';

const patchSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	// tcp_socket接続の編集用。part分更新（例: パスワードだけ変更）を想定し全フィールド任意にする。
	// マスク値（********）のまま送られてきたフィールドは mergeAuthConfig で既存値を保持する
	config: z.record(z.string(), z.unknown()).optional()
});

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const row = await getDbConnection(db, params.id);
	if (!row) return errors.notFound();
	return json({ ...row, config: maskAuthConfig(JSON.parse(row.config)) });
};

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const existing = await getDbConnection(db, params.id);
	if (!existing) return errors.notFound();

	const body = patchSchema.parse(await request.json());
	const existingConfig = JSON.parse(existing.config);
	await updateDbConnection(db, params.id, {
		...(body.name !== undefined && { name: body.name }),
		...(body.description !== undefined && { description: body.description }),
		...(body.config !== undefined && { config: JSON.stringify(mergeAuthConfig(existingConfig, body.config)) })
	});
	const row = await getDbConnection(db, params.id);
	return json({ ...row!, config: maskAuthConfig(JSON.parse(row!.config)) });
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
