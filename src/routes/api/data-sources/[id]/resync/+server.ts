import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource, updateDataSource, parseSchema } from '$lib/server/db/data-source-service';
import { getDbConnection, getExternalTableSyncByDataSource, updateExternalTableSync } from '$lib/server/db/db-connection-service';
import { getDriver, type DbConnectionProvider } from '$lib/server/db-connections/registry';
import { ingestExternalTable, type SyncColumn } from '$lib/server/db-connections/ingest';
import type { IngestQueueMessage } from '$lib/server/db-connections/queue-consumer';
import { errors } from '$lib/server/errors';

// Used by the "Sync now" button on /database/[id]. Re-ingests using the previous configuration
// (external_table_syncs) as-is, without redoing column selection (if you want to change the
// column layout, start over from the ingestion flow on /connections)
export const POST: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);

	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound();

	const sync = await getExternalTableSyncByDataSource(db, params.id);
	if (!sync) return errors.badRequest('This data source was not ingested via an external DB connection');

	const connection = await getDbConnection(db, sync.dbConnectionId);
	if (!connection) return errors.notFound('Connection settings not found');

	const config = JSON.parse(connection.config) as { bindingName?: string };
	const driver = getDriver(connection.provider as DbConnectionProvider, config, platform.env as Record<string, unknown>);
	const table = { schema: sync.externalSchema, name: sync.externalTable };
	const columnMapping = JSON.parse(sync.columnMapping) as Record<string, string>;
	const columns: SyncColumn[] = parseSchema(source.schemaJson).map((c) => ({
		...c,
		externalName: columnMapping[c.key] ?? c.key
	}));

	try {
		const result = await ingestExternalTable(platform.env.DB, driver, table, source.tableName, columns);
		await updateDataSource(db, params.id, { rowCount: result.inserted });
		await updateExternalTableSync(db, sync.id, {
			lastSyncStatus: result.truncated ? 'syncing' : 'success',
			lastSyncError: null,
			lastSyncRowCount: result.inserted,
			lastSyncOffset: result.inserted,
			...(result.truncated ? {} : { lastSyncedAt: new Date() })
		});

		let queued = false;
		if (result.truncated) {
			if (platform.env.INGEST_QUEUE) {
				const message: IngestQueueMessage = {
					syncId: sync.id,
					dataSourceId: params.id,
					dbConnectionId: connection.id,
					tableName: source.tableName,
					table,
					columns,
					offset: result.inserted
				};
				await platform.env.INGEST_QUEUE.send(message);
				queued = true;
			} else {
				await updateExternalTableSync(db, sync.id, {
					lastSyncStatus: 'failed',
					lastSyncError: 'Cannot continue ingestion because the INGEST_QUEUE binding is not configured'
				});
			}
		}

		return json({ inserted: result.inserted, truncated: result.truncated, queued });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		await updateExternalTableSync(db, sync.id, { lastSyncStatus: 'failed', lastSyncError: message });
		return errors.badRequest(`Resync failed: ${message}`);
	} finally {
		await driver.close();
	}
};
