import { json } from '@sveltejs/kit';
import { z } from 'zod/v4';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { fitModelFromDataSource } from '$lib/server/analysis/engine';
import { errors } from '$lib/server/errors';

const bodySchema = z.object({
	dataSourceId: z.string(),
	targetColumn: z.string(),
	featureColumns: z.array(z.string()).min(1)
});

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = bodySchema.parse(await request.json());

	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, body.dataSourceId);
	if (!source) return errors.notFound('データソースが見つかりません');

	try {
		const model = await fitModelFromDataSource(platform.env.DB, source, {
			method: 'linear_regression',
			targetColumn: body.targetColumn,
			featureColumns: body.featureColumns
		});
		return json({ model });
	} catch (e) {
		return errors.badRequest(e instanceof Error ? e.message : String(e));
	}
};
