import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { errors } from '$lib/server/errors';
import { createDb } from '$lib/server/db';
import { validateSelectOnly, validateNoSystemTables } from '$lib/server/db/sql-guard';

const schema = z.object({ sql: z.string().min(1) });

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const { sql } = schema.parse(await request.json());

	const selectError = validateSelectOnly(sql);
	if (selectError) return errors.badRequest(selectError);

	const db = createDb(platform.env.DB);
	const systemError = await validateNoSystemTables(db, sql);
	if (systemError) return errors.badRequest(systemError);

	try {
		const result = await platform.env.DB.prepare(sql).all();
		const rows = result.results as Record<string, unknown>[];
		return json({ columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows });
	} catch (e) {
		return errors.badRequest(`SQLエラー: ${e instanceof Error ? e.message : String(e)}`);
	}
};
