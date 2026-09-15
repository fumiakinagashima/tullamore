import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource, parseSchema } from '$lib/server/db/data-source-service';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = createDb(platform!.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) throw error(404, 'Data source not found');
	return { source, columns: parseSchema(source.schemaJson) };
};
