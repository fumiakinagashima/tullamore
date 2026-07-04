import type { LayoutServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listDataSources, parseSchema } from '$lib/server/db/data-source-service';

export const load: LayoutServerLoad = async ({ platform }) => {
	const db = createDb(platform!.env.DB);
	const sources = await listDataSources(db);
	return {
		sources: sources.map((s) => ({
			id: s.id,
			name: s.name,
			columns: parseSchema(s.schemaJson)
		}))
	};
};
