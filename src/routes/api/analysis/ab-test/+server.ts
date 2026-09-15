import { json } from '@sveltejs/kit';
import { z } from 'zod/v4';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { runAbTestFromDataSource } from '$lib/server/analysis/ab-test';
import { assessAbTestValidity } from '$lib/analysis/ab-test';
import { AB_TEST_SIGNIFICANCE_ALPHA } from '$lib/constants';
import { errors } from '$lib/server/errors';

const bodySchema = z.object({
	dataSourceId: z.string(),
	groupColumn: z.string(),
	metricColumn: z.string(),
	testType: z.enum(['mean', 'proportion'])
});

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = bodySchema.parse(await request.json());

	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, body.dataSourceId);
	if (!source) return errors.notFound('Data source not found');

	try {
		const result = await runAbTestFromDataSource(platform.env.DB, source, {
			groupColumn: body.groupColumn,
			metricColumn: body.metricColumn,
			testType: body.testType,
			alpha: AB_TEST_SIGNIFICANCE_ALPHA
		});
		const validity = assessAbTestValidity(result);
		return json({ result, validity });
	} catch (e) {
		return errors.badRequest(e instanceof Error ? e.message : String(e));
	}
};
