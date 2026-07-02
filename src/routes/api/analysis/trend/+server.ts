import { json } from '@sveltejs/kit';
import { z } from 'zod/v4';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { fitTrendFromDataSource, getTrendSeries } from '$lib/server/analysis/trend';
import { errors } from '$lib/server/errors';

const bodySchema = z.object({
	dataSourceId: z.string(),
	dateColumn: z.string(),
	targetColumn: z.string(),
	horizonMonths: z.number().int().min(1).max(60)
});

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = bodySchema.parse(await request.json());

	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, body.dataSourceId);
	if (!source) return errors.notFound('データソースが見つかりません');

	try {
		const model = await fitTrendFromDataSource(platform.env.DB, source, body.dateColumn, body.targetColumn);
		const series = await getTrendSeries(
			platform.env.DB,
			source.tableName,
			body.dateColumn,
			body.targetColumn,
			body.horizonMonths,
			model
		);
		return json({ model, ...series });
	} catch (e) {
		return errors.badRequest(e instanceof Error ? e.message : String(e));
	}
};
