import { describe, it, expect } from 'vitest';
import { designVariables } from './variable-design';
import type { DataSource } from '../db/schema';

function makeDataSource(columns: { key: string; label: string; type: string }[]): DataSource {
	return {
		id: 'ds1',
		name: 'テスト',
		description: null,
		tableName: 'ds_test',
		schemaJson: JSON.stringify(columns),
		rowCount: 100,
		createdAt: new Date(),
		updatedAt: new Date()
	};
}

// target_column を指定しない場合はD1に問い合わせないため、スタブで十分
const unusedDb = {} as D1Database;

describe('designVariables (target_column なし)', () => {
	it('classifies continuous numeric columns as target candidates and excludes the rest', async () => {
		const source = makeDataSource([
			{ key: '_id', label: 'ID', type: 'number' },
			{ key: '売上金額', label: '売上金額', type: 'number' },
			{ key: '地域', label: '地域', type: 'text' },
			{ key: '契約日', label: '契約日', type: 'date' }
		]);

		const result = await designVariables(unusedDb, source);

		expect(result.targetCandidates.map((c) => c.key)).toEqual(['売上金額']);
		expect(result.excludedColumns.map((c) => c.key).sort()).toEqual(['_id', '地域', '契約日']);
		expect(result.featureCandidates).toBeUndefined();
	});

	it('throws when the requested target column is not a numeric column', async () => {
		const source = makeDataSource([{ key: '地域', label: '地域', type: 'text' }]);
		await expect(designVariables(unusedDb, source, '地域')).rejects.toThrow(/数値列ではないか/);
	});
});
