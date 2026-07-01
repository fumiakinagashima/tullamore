import { describe, it, expect } from 'vitest';
import { parseUITag } from './stream';

describe('parseUITag (scatter chart)', () => {
	it('parses a single-series scatter chart', () => {
		const tag = '<ui type="chart" chartType="scatter" title="広告費と売上" xLabel="広告費" yLabel="売上">' +
			'[{"x":100,"y":200},{"x":150,"y":260}]' +
			'</ui>';
		const result = parseUITag(tag);
		expect(result).toEqual({
			type: 'chart',
			chartType: 'scatter',
			title: '広告費と売上',
			xLabel: '広告費',
			yLabel: '売上',
			points: [{ x: 100, y: 200 }, { x: 150, y: 260 }]
		});
	});

	it('parses a multi-series scatter chart (points-based detection)', () => {
		const tag = '<ui type="chart" chartType="scatter">' +
			'[{"name":"東京","points":[{"x":1,"y":2}]},{"name":"大阪","points":[{"x":3,"y":4}]}]' +
			'</ui>';
		const result = parseUITag(tag);
		expect(result?.type).toBe('chart');
		if (result?.type === 'chart') {
			expect(result.pointSeries).toEqual([
				{ name: '東京', points: [{ x: 1, y: 2 }] },
				{ name: '大阪', points: [{ x: 3, y: 4 }] }
			]);
		}
	});

	it('still parses a normal bar chart', () => {
		const tag = '<ui type="chart" chartType="bar" title="カテゴリ別">[{"label":"食品","value":10}]</ui>';
		const result = parseUITag(tag);
		expect(result).toEqual({ type: 'chart', chartType: 'bar', title: 'カテゴリ別', mode: undefined, data: [{ label: '食品', value: 10 }] });
	});
});
