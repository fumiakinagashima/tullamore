import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getSimulator, parseModel } from '$lib/server/db/simulator-service';
import { getDataSource } from '$lib/server/db/data-source-service';
import { toSimulatorContent } from '$lib/server/analysis/simulator-view';
import { reviewSimulator } from '$lib/server/analysis/review';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = createDb(platform!.env.DB);
	const simulator = await getSimulator(db, params.id);
	if (!simulator) throw error(404, 'Simulator not found');

	const dataSource = await getDataSource(db, simulator.dataSourceId);
	if (!dataSource) throw error(404, 'The source data source was not found');

	const content = toSimulatorContent(simulator, dataSource);
	const model = parseModel(simulator.modelJson);
	const review = await reviewSimulator(platform!.env.DB, dataSource.tableName, model);

	return { content, review, dataSourceId: dataSource.id, dataSourceName: dataSource.name };
};
