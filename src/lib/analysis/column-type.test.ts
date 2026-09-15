import { describe, it, expect } from 'vitest';
import { inferAnalysisColumnType, continuousColumns } from './column-type';

describe('inferAnalysisColumnType', () => {
	it('classifies date columns', () => {
		expect(inferAnalysisColumnType({ key: 'contract_date', label: 'Contract Date', type: 'date' })).toBe('date');
	});

	it('classifies plain numeric columns as continuous', () => {
		expect(inferAnalysisColumnType({ key: 'sales_amount', label: 'Sales Amount', type: 'number' })).toBe('continuous');
	});

	it('classifies numeric id-like columns as id', () => {
		expect(inferAnalysisColumnType({ key: 'customer_id', label: 'Customer ID', type: 'number' })).toBe('id');
		// '顧客番号' ("customer number") exercises the ID_SUFFIX_JA regex in column-type.ts, which
		// matches the Japanese suffixes 番号/コード for datasets with Japanese column names.
		expect(inferAnalysisColumnType({ key: '顧客番号', label: 'Customer Number', type: 'number' })).toBe('id');
	});

	it('classifies text columns as categorical by default', () => {
		expect(inferAnalysisColumnType({ key: 'region', label: 'Region', type: 'text' })).toBe('categorical');
	});
});

describe('continuousColumns', () => {
	it('keeps only numeric non-id columns', () => {
		const columns = [
			{ key: 'id', label: 'ID', type: 'number' as const },
			{ key: 'sales_amount', label: 'Sales Amount', type: 'number' as const },
			{ key: 'region', label: 'Region', type: 'text' as const }
		];
		expect(continuousColumns(columns).map((c) => c.key)).toEqual(['sales_amount']);
	});
});
