import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import {
	getDataSource,
	updateDataSource,
	parseSchema,
	isValidColumnKey,
	type ColumnDef
} from '$lib/server/db/data-source-service';
import { errors } from '$lib/server/errors';

const patchSchema = z.object({
	columns: z.array(z.object({
		// For existing columns, the key before the change (used to detect renames). Omitted for newly added columns
		originalKey: z.string().optional(),
		key: z.string().min(1),
		label: z.string().min(1),
		// Required only for newly added columns. Ignored here for existing columns since they keep their original type
		type: z.enum(['text', 'number', 'date', 'boolean']).optional()
	})).min(1)
});

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = patchSchema.parse(await request.json());

	if (body.columns.some((c) => !isValidColumnKey(c.key))) {
		return errors.badRequest('Column keys may only contain alphanumeric characters and underscores, and must start with a letter');
	}
	if (new Set(body.columns.map((c) => c.key)).size !== body.columns.length) {
		return errors.badRequest('Column keys must be unique');
	}

	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound('Data source not found');

	const current = parseSchema(source.schemaJson);
	const currentByKey = new Map(current.map((c) => [c.key, c]));

	const finalColumns: ColumnDef[] = [];
	const stmts: D1PreparedStatement[] = [];
	const survivingOriginalKeys = new Set<string>();

	for (const col of body.columns) {
		if (col.originalKey) {
			const original = currentByKey.get(col.originalKey);
			if (!original) return errors.badRequest(`Original column not found: ${col.originalKey}`);
			survivingOriginalKeys.add(col.originalKey);
			if (col.key !== col.originalKey) {
				stmts.push(
					platform.env.DB.prepare(
						`ALTER TABLE \`${source.tableName}\` RENAME COLUMN \`${col.originalKey}\` TO \`${col.key}\``
					)
				);
			}
			// The type of an existing column cannot be changed. Always carry over the original type
			finalColumns.push({ key: col.key, label: col.label, type: original.type });
		} else {
			const type = col.type ?? 'text';
			const sqlType = type === 'number' ? 'REAL' : type === 'boolean' ? 'INTEGER' : 'TEXT';
			stmts.push(
				platform.env.DB.prepare(`ALTER TABLE \`${source.tableName}\` ADD COLUMN \`${col.key}\` ${sqlType}`)
			);
			finalColumns.push({ key: col.key, label: col.label, type });
		}
	}

	for (const original of current) {
		if (!survivingOriginalKeys.has(original.key)) {
			stmts.push(platform.env.DB.prepare(`ALTER TABLE \`${source.tableName}\` DROP COLUMN \`${original.key}\``));
		}
	}

	try {
		if (stmts.length > 0) await platform.env.DB.batch(stmts);
	} catch (e) {
		return errors.badRequest(`Failed to change schema: ${e instanceof Error ? e.message : String(e)}`);
	}

	await updateDataSource(db, params.id, { schemaJson: JSON.stringify(finalColumns) });
	return json({ ok: true, columns: finalColumns });
};
