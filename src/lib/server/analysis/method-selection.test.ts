import { describe, it, expect } from 'vitest';
import { selectAnalysisMethod } from './method-selection';
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

describe('selectAnalysisMethod', () => {
	it('recommends linear_regression for a continuous numeric target', () => {
		const source = makeDataSource([{ key: 'sales_amount', label: 'Sales Amount', type: 'number' }]);
		const result = selectAnalysisMethod(source, 'sales_amount');
		expect(result.method).toBe('linear_regression');
	});

	it('returns no method for a non-numeric target', () => {
		const source = makeDataSource([{ key: 'region', label: 'Region', type: 'text' }]);
		const result = selectAnalysisMethod(source, 'region');
		expect(result.method).toBeNull();
	});

	it('returns no method for an id-like numeric target', () => {
		const source = makeDataSource([{ key: 'customer_id', label: 'Customer ID', type: 'number' }]);
		const result = selectAnalysisMethod(source, 'customer_id');
		expect(result.method).toBeNull();
	});

	it('returns an error reason for a column that does not exist', () => {
		const source = makeDataSource([{ key: 'sales_amount', label: 'Sales Amount', type: 'number' }]);
		const result = selectAnalysisMethod(source, 'nonexistent_column');
		expect(result.method).toBeNull();
		expect(result.reason).toContain('does not exist');
	});
});
