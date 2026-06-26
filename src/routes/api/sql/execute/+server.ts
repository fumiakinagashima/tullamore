import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { errors } from '$lib/server/errors';

const schema = z.object({ sql: z.string().min(1) });

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const { sql } = schema.parse(await request.json());

	const normalized = sql.trim().toUpperCase();
	if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
		return errors.badRequest('SELECT文のみ実行できます');
	}
	const dangerous = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|ATTACH|DETACH)\b/i;
	if (dangerous.test(sql)) return errors.badRequest('SELECT以外のSQL文は実行できません');

	try {
		const result = await platform.env.DB.prepare(sql).all();
		const rows = result.results as Record<string, unknown>[];
		return json({ columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows });
	} catch (e) {
		return errors.badRequest(`SQLエラー: ${e instanceof Error ? e.message : String(e)}`);
	}
};
