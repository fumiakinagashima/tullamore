import { describe, it, expect } from 'vitest';
import { inferAnalysisColumnType, continuousColumns } from './column-type';

describe('inferAnalysisColumnType', () => {
	it('classifies date columns', () => {
		expect(inferAnalysisColumnType({ key: '契約日', label: '契約日', type: 'date' })).toBe('date');
	});

	it('classifies plain numeric columns as continuous', () => {
		expect(inferAnalysisColumnType({ key: '売上金額', label: '売上金額', type: 'number' })).toBe('continuous');
	});

	it('classifies numeric id-like columns as id', () => {
		expect(inferAnalysisColumnType({ key: 'customer_id', label: '顧客ID', type: 'number' })).toBe('id');
		expect(inferAnalysisColumnType({ key: '顧客番号', label: '顧客番号', type: 'number' })).toBe('id');
	});

	it('classifies text columns as categorical by default', () => {
		expect(inferAnalysisColumnType({ key: '地域', label: '地域', type: 'text' })).toBe('categorical');
	});
});

describe('continuousColumns', () => {
	it('keeps only numeric non-id columns', () => {
		const columns = [
			{ key: 'id', label: 'ID', type: 'number' as const },
			{ key: '売上金額', label: '売上金額', type: 'number' as const },
			{ key: '地域', label: '地域', type: 'text' as const }
		];
		expect(continuousColumns(columns).map((c) => c.key)).toEqual(['売上金額']);
	});
});
