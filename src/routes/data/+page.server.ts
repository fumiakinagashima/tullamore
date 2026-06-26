import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listDataSources } from '$lib/server/db/data-source-service';

export const load: PageServerLoad = async ({ platform }) => {
	const db = createDb(platform!.env.DB);
	const sources = await listDataSources(db);
	return { sources };
};
