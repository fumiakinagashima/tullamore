import { describe, it, expect } from 'vitest';
import { fitTrendFromRows, buildTrendSeries, type TrendRawRow } from './trend';

function makeDailyRows(days: number): TrendRawRow[] {
	return Array.from({ length: days }, (_, i) => {
		const d = new Date(Date.UTC(2026, 0, 1 + i));
		return { date: d.toISOString().slice(0, 10), value: 100 + i * 2 };
	});
}

describe('fitTrendFromRows', () => {
	it('fits a perfect linear trend regardless of aggregation granularity', () => {
		const model = fitTrendFromRows(makeDailyRows(30));
		expect(model.metrics.r2).toBeCloseTo(1, 6);
	});
});

describe('buildTrendSeries', () => {
	it('aggregates into one bucket per day when granularity is day', () => {
		const rows = makeDailyRows(10);
		const model = fitTrendFromRows(rows);
		const series = buildTrendSeries(rows, model, 6, 'day');
		expect(series.historicalCount).toBe(10);
		// 半年後まで日次予測すると、実績日数よりずっと多い予測点数になる
		expect(series.trend.length).toBeGreaterThan(180);
	});

	it('aggregates into weekly buckets when granularity is week', () => {
		const rows = makeDailyRows(21); // 3 weeks of data
		const model = fitTrendFromRows(rows);
		const series = buildTrendSeries(rows, model, 6, 'week');
		expect(series.historicalCount).toBeLessThanOrEqual(4);
		expect(series.historicalCount).toBeGreaterThanOrEqual(3);
	});

	it('defaults to monthly buckets (backward compatible)', () => {
		const rows = [
			{ date: '2026-01-05', value: 10 },
			{ date: '2026-01-20', value: 12 },
			{ date: '2026-02-10', value: 14 }
		];
		const model = fitTrendFromRows(rows);
		const series = buildTrendSeries(rows, model, 6);
		expect(series.historicalCount).toBe(2);
		expect(series.historical[0].label).toBe('2026-01');
	});

	it('produces roughly 6 future points for a 6-month horizon at monthly granularity', () => {
		const rows = makeDailyRows(60);
		const model = fitTrendFromRows(rows);
		const series = buildTrendSeries(rows, model, 6, 'month');
		const futureCount = series.trend.length - series.historicalCount;
		expect(futureCount).toBe(6);
	});
});
