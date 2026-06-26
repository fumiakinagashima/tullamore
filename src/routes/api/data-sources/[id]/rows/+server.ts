import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { errors } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound();

	const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 1000);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	const rows = await platform.env.DB.prepare(
		`SELECT * FROM \`${source.tableName}\` LIMIT ? OFFSET ?`
	).bind(limit, offset).all();

	return json({ rows: rows.results, total: source.rowCount });
};
