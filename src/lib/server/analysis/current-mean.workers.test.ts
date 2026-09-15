import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createDb } from '../db';
import { createDataSource, makeTableName } from '../db/data-source-service';
import { computeCurrentMean } from './descriptive-stats';

describe('computeCurrentMean (real D1)', () => {
	it('averages over the whole table when no date range is given', async () => {
		const db = createDb(env.DB);
		const tableName = makeTableName('mean-test-all');
		await env.DB.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, sold_at TEXT, revenue REAL)`);
		const rows: [number, string, number][] = [
			[1, '2026-01-10', 100],
			[2, '2026-06-10', 200],
			[3, '2027-01-10', 900]
		];
		for (const [id, soldAt, revenue] of rows) {
			await env.DB.prepare(`INSERT INTO ${tableName} (id, sold_at, revenue) VALUES (?, ?, ?)`).bind(id, soldAt, revenue).run();
		}
		const dataSource = await createDataSource(db, {
			id: 'mean-test-all',
			name: 'Mean test (all)',
			tableName,
			schemaJson: JSON.stringify([
				{ key: 'sold_at', label: 'Sale date', type: 'date' },
				{ key: 'revenue', label: 'Revenue', type: 'number' }
			]),
			rowCount: rows.length
		});

		const mean = await computeCurrentMean(env.DB, dataSource, 'revenue');
		expect(mean).toBeCloseTo((100 + 200 + 900) / 3);
	});

	it('scopes to rows within the date range when one is given', async () => {
		const db = createDb(env.DB);
		const tableName = makeTableName('mean-test-scoped');
		await env.DB.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, sold_at TEXT, revenue REAL)`);
		const rows: [number, string, number][] = [
			[1, '2025-12-31', 100], // outside the range (before 2026)
			[2, '2026-03-15', 200], // inside the range
			[3, '2026-09-20', 400], // inside the range
			[4, '2027-01-01', 900] // outside the range (2027)
		];
		for (const [id, soldAt, revenue] of rows) {
			await env.DB.prepare(`INSERT INTO ${tableName} (id, sold_at, revenue) VALUES (?, ?, ?)`).bind(id, soldAt, revenue).run();
		}
		const dataSource = await createDataSource(db, {
			id: 'mean-test-scoped',
			name: 'Mean test (scoped)',
			tableName,
			schemaJson: JSON.stringify([
				{ key: 'sold_at', label: 'Sale date', type: 'date' },
				{ key: 'revenue', label: 'Revenue', type: 'number' }
			]),
			rowCount: rows.length
		});

		const mean = await computeCurrentMean(env.DB, dataSource, 'revenue', {
			column: 'sold_at',
			from: '2026-01-01',
			to: '2026-12-31'
		});
		expect(mean).toBeCloseTo((200 + 400) / 2);
	});

	it('returns null (not an error) when no rows fall within the given date range', async () => {
		// It's a normal state for there to be no actuals yet within the period (e.g. right after
		// creating a KPI plan targeting a future period), so we return null instead of throwing
		// (allowing the caller to show "no actuals yet" instead of hiding the plan entirely)
		const db = createDb(env.DB);
		const tableName = makeTableName('mean-test-empty-range');
		await env.DB.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, sold_at TEXT, revenue REAL)`);
		await env.DB.prepare(`INSERT INTO ${tableName} (id, sold_at, revenue) VALUES (1, '2020-01-01', 100)`).run();
		const dataSource = await createDataSource(db, {
			id: 'mean-test-empty-range',
			name: 'Mean test (empty range)',
			tableName,
			schemaJson: JSON.stringify([
				{ key: 'sold_at', label: 'Sale date', type: 'date' },
				{ key: 'revenue', label: 'Revenue', type: 'number' }
			]),
			rowCount: 1
		});

		const mean = await computeCurrentMean(env.DB, dataSource, 'revenue', {
			column: 'sold_at',
			from: '2026-01-01',
			to: '2026-12-31'
		});
		expect(mean).toBeNull();
	});
});
