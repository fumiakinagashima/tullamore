import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = createDb(platform!.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) throw error(404, 'データソースが見つかりません');
	return { source };
};
