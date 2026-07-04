import { createDb } from '$lib/server/db';
import { getDbConnection, updateExternalTableSync } from '$lib/server/db/db-connection-service';
import { updateDataSource } from '$lib/server/db/data-source-service';
import { getDriver, type DbConnectionProvider } from './registry';
import { ingestExternalTableChunk, type SyncColumn } from './ingest';
import type { ExternalTableRef } from './types';

/** ingestExternalTable がSYNC_ROW_BUDGETで打ち切った続きを、Queue経由で継続取り込みするためのメッセージ */
export type IngestQueueMessage = {
	syncId: string;
	dataSourceId: string;
	dbConnectionId: string;
	tableName: string;
	table: ExternalTableRef;
	columns: SyncColumn[];
	/** 次にfetchRowsを開始する位置 */
	offset: number;
};

export type IngestQueueEnv = {
	DB: D1Database;
	INGEST_QUEUE?: Queue<IngestQueueMessage>;
} & Record<string, unknown>;

/**
 * worker.ts の queue() ハンドラから呼ばれる。バッチ内の各メッセージを順に処理し、
 * まだ続きがあれば次のoffsetで自分自身を再度キューに積む（1メッセージ = 1呼び出し分のCPU予算に収める）。
 * 失敗時もack()する: 同じ接続情報・外部テーブルに起因するエラーは再送しても大抵同じ理由で失敗し、
 * 無限リトライでキューを詰まらせるだけのため、external_table_syncsにfailedとして記録して終わらせる
 * （ユーザーは/database/[id]の「今すぐ再同期」から手動でやり直せる）。
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
			lastSyncError: '接続設定が見つかりません（削除された可能性があります）'
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
					lastSyncError: 'INGEST_QUEUE バインディングが設定されていないため継続取り込みできません'
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
