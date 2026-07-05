import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { computeSufficientStats } from './sufficient-stats';

describe('computeSufficientStats (real D1)', () => {
	it('aggregates sums/cross-sums/min/max over a seeded table', async () => {
		await env.DB.exec('CREATE TABLE sales (id INTEGER PRIMARY KEY, revenue REAL, ad_spend REAL, visitors REAL)');
		const rows = [
			[1, 100, 10, 50],
			[2, 200, 20, 80],
			[3, 150, 15, 60],
			[4, 300, 25, 90]
		];
		for (const [id, revenue, adSpend, visitors] of rows) {
			await env.DB.prepare('INSERT INTO sales (id, revenue, ad_spend, visitors) VALUES (?, ?, ?, ?)')
				.bind(id, revenue, adSpend, visitors)
				.run();
		}

		const stats = await computeSufficientStats(env.DB, 'sales', 'revenue', ['ad_spend', 'visitors']);

		expect(stats.n).toBe(4);
		expect(stats.targetSum).toBe(750);
		expect(stats.targetSumSq).toBe(100 ** 2 + 200 ** 2 + 150 ** 2 + 300 ** 2);
		expect(stats.featureSums.ad_spend).toBe(70);
		expect(stats.featureSums.visitors).toBe(280);
		expect(stats.featureMin.ad_spend).toBe(10);
		expect(stats.featureMax.ad_spend).toBe(25);
		expect(stats.featureTargetSums.ad_spend).toBe(10 * 100 + 20 * 200 + 15 * 150 + 25 * 300);
	});

	it('throws when there are no fully non-null rows', async () => {
		await env.DB.exec('CREATE TABLE empty_sales (id INTEGER PRIMARY KEY, revenue REAL, ad_spend REAL)');
		await expect(computeSufficientStats(env.DB, 'empty_sales', 'revenue', ['ad_spend'])).rejects.toThrow();
	});
});
