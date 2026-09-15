import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import { listDataSources, createDataSource, makeTableName, isValidColumnKey } from '$lib/server/db/data-source-service';
import { errors } from '$lib/server/errors';

const createSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	columns: z.array(z.object({
		key: z.string().min(1),
		label: z.string().min(1),
		type: z.enum(['text', 'number', 'date', 'boolean'])
	})).min(1)
});

export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const sources = await listDataSources(db);
	return json(sources);
};

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = createSchema.parse(await request.json());
	if (body.columns.some((c) => !isValidColumnKey(c.key))) {
		return errors.badRequest('Column keys may only contain alphanumeric characters and underscores, and must start with a letter');
	}
	if (new Set(body.columns.map((c) => c.key)).size !== body.columns.length) {
		return errors.badRequest('Duplicate column keys');
	}
	const db = createDb(platform.env.DB);
	const id = crypto.randomUUID();
	const tableName = makeTableName(id);

	const colDefs = body.columns.map((c) => {
		const sqlType = c.type === 'number' ? 'REAL' : c.type === 'boolean' ? 'INTEGER' : 'TEXT';
		return `\`${c.key}\` ${sqlType}`;
	}).join(', ');
	await platform.env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS \`${tableName}\` (\`_id\` INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs})`
	).run();

	const source = await createDataSource(db, {
		id,
		name: body.name,
		description: body.description ?? null,
		tableName,
		schemaJson: JSON.stringify(body.columns),
		rowCount: 0
	});
	return json(source, { status: 201 });
};
