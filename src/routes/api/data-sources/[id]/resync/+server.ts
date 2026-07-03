import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource, updateDataSource, parseSchema } from '$lib/server/db/data-source-service';
import { getDbConnection, getExternalTableSyncByDataSource, updateExternalTableSync } from '$lib/server/db/db-connection-service';
import { getDriver, type DbConnectionProvider } from '$lib/server/db-connections/registry';
import { ingestExternalTable, type SyncColumn } from '$lib/server/db-connections/ingest';
import { errors } from '$lib/server/errors';

// /database/[id] の「今すぐ再同期」ボタン用。列選択をやり直さず、前回の設定（external_table_syncs）を
// そのまま使って再取り込みする（列構成を変えたい場合は /connections の取り込みフローからやり直す）
export const POST: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);

	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound();

	const sync = await getExternalTableSyncByDataSource(db, params.id);
	if (!sync) return errors.badRequest('この データソースは外部DB連携で取り込まれたものではありません');

	const connection = await getDbConnection(db, sync.dbConnectionId);
	if (!connection) return errors.notFound('接続設定が見つかりません');

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
			lastSyncStatus: 'success',
			lastSyncError: null,
			lastSyncRowCount: result.inserted,
			lastSyncedAt: new Date()
		});
		return json({ inserted: result.inserted, truncated: result.truncated });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		await updateExternalTableSync(db, sync.id, { lastSyncStatus: 'failed', lastSyncError: message });
		return errors.badRequest(`再同期に失敗しました: ${message}`);
	} finally {
		await driver.close();
	}
};
