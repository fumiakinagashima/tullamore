import { describe, it, expect } from 'vitest';
import { parseUITag } from './stream';

describe('parseUITag (scatter chart)', () => {
	it('parses a single-series scatter chart', () => {
		const tag = '<ui type="chart" chartType="scatter" title="Ad spend vs revenue" xLabel="Ad spend" yLabel="Revenue">' +
			'[{"x":100,"y":200},{"x":150,"y":260}]' +
			'</ui>';
		const result = parseUITag(tag);
		expect(result).toEqual({
			type: 'chart',
			chartType: 'scatter',
			title: 'Ad spend vs revenue',
			xLabel: 'Ad spend',
			yLabel: 'Revenue',
			points: [{ x: 100, y: 200 }, { x: 150, y: 260 }]
		});
	});

	it('parses a multi-series scatter chart (points-based detection)', () => {
		const tag = '<ui type="chart" chartType="scatter">' +
			'[{"name":"Tokyo","points":[{"x":1,"y":2}]},{"name":"Osaka","points":[{"x":3,"y":4}]}]' +
			'</ui>';
		const result = parseUITag(tag);
		expect(result?.type).toBe('chart');
		if (result?.type === 'chart') {
			expect(result.pointSeries).toEqual([
				{ name: 'Tokyo', points: [{ x: 1, y: 2 }] },
				{ name: 'Osaka', points: [{ x: 3, y: 4 }] }
			]);
		}
	});

	it('still parses a normal bar chart', () => {
		const tag = '<ui type="chart" chartType="bar" title="By category">[{"label":"Food","value":10}]</ui>';
		const result = parseUITag(tag);
		expect(result).toEqual({ type: 'chart', chartType: 'bar', title: 'By category', mode: undefined, data: [{ label: 'Food', value: 10 }] });
	});
});
