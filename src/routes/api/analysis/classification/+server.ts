import { json } from '@sveltejs/kit';
import { z } from 'zod/v4';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { fitClassifierFromDataSource } from '$lib/server/analysis/classification';
import { assessClassificationValidity } from '$lib/analysis/methods/logistic-regression';
import { LOGISTIC_REGRESSION_MAX_ROWS } from '$lib/constants';
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
	if (!source) return errors.notFound('Data source not found');

	try {
		const { model, truncated } = await fitClassifierFromDataSource(platform.env.DB, source, {
			targetColumn: body.targetColumn,
			featureColumns: body.featureColumns,
			maxRows: LOGISTIC_REGRESSION_MAX_ROWS
		});
		const validity = assessClassificationValidity(model);
		return json({ model, truncated, validity });
	} catch (e) {
		return errors.badRequest(e instanceof Error ? e.message : String(e));
	}
};
