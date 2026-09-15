import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import {
	getDataSource,
	createDataSource,
	updateDataSource,
	isValidColumnKey,
	makeTableName,
	type ColumnDef
} from '$lib/server/db/data-source-service';
import {
	getDbConnection,
	getExternalTableSyncByDataSource,
	createExternalTableSync,
	updateExternalTableSync
} from '$lib/server/db/db-connection-service';
import { getDriver, type DbConnectionProvider } from '$lib/server/db-connections/registry';
import { ingestExternalTable } from '$lib/server/db-connections/ingest';
import type { IngestQueueMessage } from '$lib/server/db-connections/queue-consumer';
import { errors } from '$lib/server/errors';

const columnSchema = z.object({
	key: z.string().min(1),
	label: z.string().min(1),
	type: z.enum(['text', 'number', 'date', 'boolean']),
	externalName: z.string().min(1)
});

const syncSchema = z.object({
	externalSchema: z.string().min(1),
	externalTable: z.string().min(1),
	// If omitted, creates a new data source; if given, re-syncs (full replace) into an existing data source
	dataSourceId: z.string().optional(),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	columns: z.array(columnSchema).min(1)
});

export const POST: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const connection = await getDbConnection(db, params.id);
	if (!connection) return errors.notFound();

	const body = syncSchema.parse(await request.json());
	if (body.columns.some((c) => !isValidColumnKey(c.key))) {
		return errors.badRequest('Column keys may only contain letters, digits, and underscores, and must start with a letter');
	}
	if (new Set(body.columns.map((c) => c.key)).size !== body.columns.length) {
		return errors.badRequest('Column keys must not be duplicated');
	}

	const config = JSON.parse(connection.config) as { bindingName?: string };
	const driver = getDriver(connection.provider as DbConnectionProvider, config, platform.env as Record<string, unknown>);
	const table = { schema: body.externalSchema, name: body.externalTable };
	const columnDefs: ColumnDef[] = body.columns.map((c) => ({ key: c.key, label: c.label, type: c.type }));

	try {
		let dataSourceId = body.dataSourceId;
		let tableName: string;

		if (dataSourceId) {
			const existing = await getDataSource(db, dataSourceId);
			if (!existing) return errors.notFound('Data source not found');
			tableName = existing.tableName;
		} else {
			if (!body.name) return errors.badRequest('name is required');
			dataSourceId = crypto.randomUUID();
			tableName = makeTableName(dataSourceId);
			const colDefsSql = columnDefs
				.map((c) => {
					const sqlType = c.type === 'number' ? 'REAL' : c.type === 'boolean' ? 'INTEGER' : 'TEXT';
					return `\`${c.key}\` ${sqlType}`;
				})
				.join(', ');
			await platform.env.DB.prepare(
				`CREATE TABLE IF NOT EXISTS \`${tableName}\` (\`_id\` INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefsSql})`
			).run();
			await createDataSource(db, {
				id: dataSourceId,
				name: body.name,
				description: body.description ?? null,
				tableName,
				schemaJson: JSON.stringify(columnDefs),
				rowCount: 0
			});
		}

		const result = await ingestExternalTable(platform.env.DB, driver, table, tableName, body.columns);
		await updateDataSource(db, dataSourceId, { rowCount: result.inserted });

		const columnMapping = JSON.stringify(Object.fromEntries(body.columns.map((c) => [c.key, c.externalName])));
		const existingSync = await getExternalTableSyncByDataSource(db, dataSourceId);
		const syncId = existingSync?.id ?? crypto.randomUUID();
		const syncFields = {
			dbConnectionId: connection.id,
			externalSchema: body.externalSchema,
			externalTable: body.externalTable,
			columnMapping,
			lastSyncStatus: (result.truncated ? 'syncing' : 'success') as 'syncing' | 'success',
			lastSyncError: null,
			lastSyncRowCount: result.inserted,
			lastSyncOffset: result.inserted,
			...(result.truncated ? {} : { lastSyncedAt: new Date() })
		};
		if (existingSync) {
			await updateExternalTableSync(db, syncId, syncFields);
		} else {
			await createExternalTableSync(db, { id: syncId, dataSourceId, ...syncFields });
		}

		let queued = false;
		if (result.truncated) {
			if (platform.env.INGEST_QUEUE) {
				const message: IngestQueueMessage = {
					syncId,
					dataSourceId,
					dbConnectionId: connection.id,
					tableName,
					table,
					columns: body.columns,
					offset: result.inserted
				};
				await platform.env.INGEST_QUEUE.send(message);
				queued = true;
			} else {
				await updateExternalTableSync(db, syncId, {
					lastSyncStatus: 'failed',
					lastSyncError: 'Cannot continue ingestion because the INGEST_QUEUE binding is not configured'
				});
			}
		}

		return json({ dataSourceId, inserted: result.inserted, truncated: result.truncated, queued });
	} catch (e) {
		return errors.badRequest(`Ingestion failed: ${e instanceof Error ? e.message : String(e)}`);
	} finally {
		await driver.close();
	}
};
