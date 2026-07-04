import { json } from '@sveltejs/kit';
import { z } from 'zod/v4';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { computeDescriptiveStatsFromDataSource } from '$lib/server/analysis/descriptive-stats';
import { DESCRIPTIVE_STATS_SAMPLE_MAX_ROWS, DESCRIPTIVE_STATS_HISTOGRAM_BINS } from '$lib/constants';
import { errors } from '$lib/server/errors';

const bodySchema = z.object({
	dataSourceId: z.string(),
	columns: z.array(z.string()).min(1)
});

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = bodySchema.parse(await request.json());

	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, body.dataSourceId);
	if (!source) return errors.notFound('データソースが見つかりません');

	try {
		const stats = await computeDescriptiveStatsFromDataSource(
			platform.env.DB,
			source,
			body.columns,
			DESCRIPTIVE_STATS_SAMPLE_MAX_ROWS,
			DESCRIPTIVE_STATS_HISTOGRAM_BINS
		);
		return json({ stats });
	} catch (e) {
		return errors.badRequest(e instanceof Error ? e.message : String(e));
	}
};
