import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDataSource, updateDataSource, parseSchema } from '$lib/server/db/data-source-service';
import { errors } from '$lib/server/errors';

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
	const lines = text.trim().split('\n');
	if (lines.length === 0) return { headers: [], rows: [] };
	const parseLine = (line: string) => {
		const result: string[] = [];
		let field = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
			else if (c === '"') inQuotes = !inQuotes;
			else if (c === ',' && !inQuotes) { result.push(field); field = ''; }
			else field += c;
		}
		result.push(field);
		return result;
	};
	const headers = parseLine(lines[0]);
	const rows = lines.slice(1).filter(Boolean).map(parseLine);
	return { headers, rows };
}

export const POST: RequestHandler = async ({ params, request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const source = await getDataSource(db, params.id);
	if (!source) return errors.notFound();

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file) return errors.badRequest('No file was provided');
	const replace = formData.get('replace') === 'true';

	const text = await file.text();
	const { rows } = parseCSV(text);
	const columns = parseSchema(source.schemaJson);
	if (columns.length === 0) return errors.badRequest('No schema is configured');

	const colKeys = columns.map((c) => c.key);
	const placeholders = colKeys.map(() => '?').join(', ');
	const colList = colKeys.map((k) => `\`${k}\``).join(', ');
	const insertSql = `INSERT INTO \`${source.tableName}\` (${colList}) VALUES (${placeholders})`;
	const deleteStmt = platform.env.DB.prepare(`DELETE FROM \`${source.tableName}\``);

	let inserted = 0;
	const BATCH_SIZE = 100;
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		const stmts = batch.map((row) => {
			const values = colKeys.map((_, idx) => {
				const v = row[idx] ?? '';
				const col = columns[idx];
				if (col?.type === 'number') return v === '' ? null : Number(v);
				if (col?.type === 'boolean') return v === '' ? null : (v.toLowerCase() === 'true' || v === '1') ? 1 : 0;
				return v;
			});
			return platform.env!.DB!.prepare(insertSql).bind(...values);
		});
		// The delete for a full replace is bundled into the first batch and committed together (db.batch() runs atomically)
		await platform.env.DB.batch(replace && i === 0 ? [deleteStmt, ...stmts] : stmts);
		inserted += batch.length;
	}
	if (replace && rows.length === 0) {
		await platform.env.DB.batch([deleteStmt]);
	}

	const rowCount = replace ? inserted : source.rowCount + inserted;
	await updateDataSource(db, params.id, { rowCount });
	return json({ inserted, rowCount });
};
