import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { computeDataQuality } from '$lib/server/analysis/data-quality';
import { errors } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound('Data source not found');

	const report = await computeDataQuality(platform.env.DB, source);
	return json({ report });
};
