import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource } from '$lib/server/db/data-source-service';
import { getExternalTableSyncByDataSource, getDbConnection } from '$lib/server/db/db-connection-service';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = createDb(platform!.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) throw error(404, 'Data source not found');

	const sync = await getExternalTableSyncByDataSource(db, params.id);
	const connection = sync ? await getDbConnection(db, sync.dbConnectionId) : null;

	return { source, sync, connectionName: connection?.name ?? null };
};
