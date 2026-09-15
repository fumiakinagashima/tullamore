import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createDb } from '../db';
import { createDataSource, makeTableName } from '../db/data-source-service';
import { computeDataQuality } from './data-quality';

describe('computeDataQuality (real D1)', () => {
	it('reports missing counts and validity per numeric column independently', async () => {
		const db = createDb(env.DB);
		const tableName = makeTableName('quality-test');

		await env.DB.exec(
			`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, revenue REAL, all_null REAL)`
		);
		// revenue has 11 non-NULL values (the "good" sample-size threshold is 10+) plus 1 missing value.
		// all_null is entirely NULL and thus uncomputable -> verify it independently rates "poor" without dragging down the revenue column
		const rows: [number, number | null, null][] = [
			[1, 100, null],
			[2, 110, null],
			[3, null, null],
			[4, 120, null],
			[5, 130, null],
			[6, 140, null],
			[7, 150, null],
			[8, 160, null],
			[9, 170, null],
			[10, 180, null],
			[11, 190, null],
			[12, 200, null]
		];
		for (const [id, revenue, allNull] of rows) {
			await env.DB.prepare(`INSERT INTO ${tableName} (id, revenue, all_null) VALUES (?, ?, ?)`)
				.bind(id, revenue, allNull)
				.run();
		}

		const dataSource = await createDataSource(db, {
			id: 'quality-test',
			name: 'Quality test source',
			tableName,
			schemaJson: JSON.stringify([
				{ key: 'revenue', label: 'Revenue', type: 'number' },
				{ key: 'all_null', label: 'All-missing column', type: 'number' }
			]),
			rowCount: rows.length
		});

		const report = await computeDataQuality(env.DB, dataSource);

		expect(report.rowCount).toBe(rows.length);
		const revenueCol = report.columns.find((c) => c.key === 'revenue');
		expect(revenueCol?.missingCount).toBe(1);
		expect(revenueCol?.n).toBe(11);

		// A column that is entirely NULL is uncomputable and rates "poor" without affecting other columns' results
		const allNullCol = report.columns.find((c) => c.key === 'all_null');
		expect(allNullCol?.validity.overallLevel).toBe('poor');
		expect(revenueCol?.validity.overallLevel).not.toBe('poor');
	});
});
