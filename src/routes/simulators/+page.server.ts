import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listSimulators, parseModel } from '$lib/server/db/simulator-service';

export const load: PageServerLoad = async ({ platform }) => {
	const db = createDb(platform!.env.DB);
	const rows = await listSimulators(db);
	const simulators = rows.map((row) => {
		const model = parseModel(row.modelJson);
		return {
			id: row.id,
			name: row.name,
			description: row.description,
			targetColumn: row.targetColumn,
			method: row.method,
			r2: model.metrics.r2,
			sampleSize: model.metrics.sampleSize,
			createdAt: row.createdAt
		};
	});
	return { simulators };
};
