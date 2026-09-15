import { describe, it, expect } from 'vitest';
import { designVariables } from './variable-design';
import type { DataSource } from '../db/schema';

function makeDataSource(columns: { key: string; label: string; type: string }[]): DataSource {
	return {
		id: 'ds1',
		name: 'Test',
		description: null,
		tableName: 'ds_test',
		schemaJson: JSON.stringify(columns),
		rowCount: 100,
		createdAt: new Date(),
		updatedAt: new Date()
	};
}

// When target_column is not specified, D1 is not queried, so a stub is sufficient
const unusedDb = {} as D1Database;

describe('designVariables (no target_column)', () => {
	it('classifies continuous numeric columns as target candidates and excludes the rest', async () => {
		const source = makeDataSource([
			{ key: '_id', label: 'ID', type: 'number' },
			{ key: 'revenue', label: 'Revenue', type: 'number' },
			{ key: 'region', label: 'Region', type: 'text' },
			{ key: 'contract_date', label: 'Contract date', type: 'date' }
		]);

		const result = await designVariables(unusedDb, source);

		expect(result.targetCandidates.map((c) => c.key)).toEqual(['revenue']);
		expect(result.excludedColumns.map((c) => c.key).sort()).toEqual(['_id', 'contract_date', 'region']);
		expect(result.featureCandidates).toBeUndefined();
	});

	it('throws when the requested target column is not a numeric column', async () => {
		const source = makeDataSource([{ key: 'region', label: 'Region', type: 'text' }]);
		await expect(designVariables(unusedDb, source, 'region')).rejects.toThrow(/is not a numeric column/);
	});
});
