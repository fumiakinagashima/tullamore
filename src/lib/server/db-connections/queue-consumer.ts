import { createDb } from '$lib/server/db';
import { getDbConnection, updateExternalTableSync } from '$lib/server/db/db-connection-service';
import { updateDataSource } from '$lib/server/db/data-source-service';
import { getDriver, type DbConnectionProvider } from './registry';
import { ingestExternalTableChunk, type SyncColumn } from './ingest';
import type { ExternalTableRef } from './types';

/** Message for continuing ingestion via the Queue where ingestExternalTable left off after hitting SYNC_ROW_BUDGET */
export type IngestQueueMessage = {
	syncId: string;
	dataSourceId: string;
	dbConnectionId: string;
	tableName: string;
	table: ExternalTableRef;
	columns: SyncColumn[];
	/** The position at which the next fetchRows should start */
	offset: number;
};

export type IngestQueueEnv = {
	DB: D1Database;
	INGEST_QUEUE?: Queue<IngestQueueMessage>;
} & Record<string, unknown>;

/**
 * Called from worker.ts's queue() handler. Processes each message in the batch in order, and if
 * there is more to ingest, re-enqueues itself with the next offset (keeping 1 message = 1 call's
 * worth of CPU budget). Also ack()s on failure: an error caused by the same connection info/external
 * table will almost always fail again for the same reason on redelivery, which would just clog the
 * queue with infinite retries, so instead we record it as failed in external_table_syncs and stop
 * (the user can manually retry from "Resync now" on /database/[id]).
 */
export async function handleIngestQueueBatch(batch: MessageBatch<IngestQueueMessage>, env: IngestQueueEnv): Promise<void> {
	for (const message of batch.messages) {
		try {
			await processIngestMessage(message.body, env);
		} catch (e) {
			console.error('[ingest-queue] failed to process message', e);
		} finally {
			message.ack();
		}
	}
}

async function processIngestMessage(payload: IngestQueueMessage, env: IngestQueueEnv): Promise<void> {
	const db = createDb(env.DB);
	const connection = await getDbConnection(db, payload.dbConnectionId);
	if (!connection) {
		await updateExternalTableSync(db, payload.syncId, {
			lastSyncStatus: 'failed',
			lastSyncError: 'Connection settings not found (it may have been deleted)'
		});
		return;
	}

	const config = JSON.parse(connection.config) as { bindingName?: string };
	const driver = getDriver(connection.provider as DbConnectionProvider, config, env);

	try {
		const result = await ingestExternalTableChunk(env.DB, driver, payload.table, payload.tableName, payload.columns, payload.offset);
		const totalInserted = payload.offset + result.inserted;

		await updateDataSource(db, payload.dataSourceId, { rowCount: totalInserted });
		await updateExternalTableSync(db, payload.syncId, {
			lastSyncRowCount: totalInserted,
			lastSyncOffset: totalInserted,
			lastSyncStatus: result.done ? 'success' : 'syncing',
			lastSyncError: null,
			...(result.done ? { lastSyncedAt: new Date() } : {})
		});

		if (!result.done) {
			if (!env.INGEST_QUEUE) {
				await updateExternalTableSync(db, payload.syncId, {
					lastSyncStatus: 'failed',
					lastSyncError: 'Cannot continue ingestion because the INGEST_QUEUE binding is not configured'
				});
				return;
			}
			await env.INGEST_QUEUE.send({ ...payload, offset: totalInserted });
		}
	} catch (e) {
		await updateExternalTableSync(db, payload.syncId, {
			lastSyncStatus: 'failed',
			lastSyncError: e instanceof Error ? e.message : String(e)
		});
	} finally {
		await driver.close();
	}
}
