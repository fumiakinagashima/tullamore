import { describe, it, expect } from 'vitest';
import { welchTTest, twoProportionZTest, type GroupMeanStats, type GroupProportionStats } from './ab-test';
import { twoTailedPValueFromZ } from './statistics';

const ALPHA = 0.05;

describe('welchTTest', () => {
	it('returns tStat=0 and pValue=1 for identical groups', () => {
		const a: GroupMeanStats = { group: 'A', n: 20, mean: 100, variance: 25 };
		const b: GroupMeanStats = { group: 'B', n: 20, mean: 100, variance: 25 };
		const result = welchTTest(a, b, ALPHA);
		expect(result.tStat).toBeCloseTo(0, 6);
		expect(result.pValue).toBeCloseTo(1, 6);
		expect(result.significant).toBe(false);
	});

	it('matches the manual Welch t-statistic formula', () => {
		const a: GroupMeanStats = { group: 'A', n: 10, mean: 50, variance: 100 };
		const b: GroupMeanStats = { group: 'B', n: 15, mean: 45, variance: 64 };
		const result = welchTTest(a, b, ALPHA);

		const seA2 = 100 / 10;
		const seB2 = 64 / 15;
		const se = Math.sqrt(seA2 + seB2);
		const expectedT = (50 - 45) / se;
		const expectedDf = (seA2 + seB2) ** 2 / ((seA2 * seA2) / 9 + (seB2 * seB2) / 14);

		expect(result.tStat).toBeCloseTo(expectedT, 6);
		expect(result.df).toBeCloseTo(expectedDf, 6);
		expect(result.meanDiff).toBeCloseTo(5, 6);
	});

	it('flips sign symmetrically when groups are swapped, with the same p-value', () => {
		const a: GroupMeanStats = { group: 'A', n: 30, mean: 120, variance: 400 };
		const b: GroupMeanStats = { group: 'B', n: 25, mean: 95, variance: 225 };
		const ab = welchTTest(a, b, ALPHA);
		const ba = welchTTest(b, a, ALPHA);

		expect(ba.tStat).toBeCloseTo(-ab.tStat, 6);
		expect(ba.meanDiff).toBeCloseTo(-ab.meanDiff, 6);
		expect(ba.pValue).toBeCloseTo(ab.pValue, 9);
	});

	it('the 95% CI excludes 0 exactly when the result is significant at alpha=0.05', () => {
		const clearlySeparated: GroupMeanStats = { group: 'A', n: 200, mean: 110, variance: 25 };
		const baseline: GroupMeanStats = { group: 'B', n: 200, mean: 100, variance: 25 };
		const sig = welchTTest(clearlySeparated, baseline, ALPHA);
		expect(sig.significant).toBe(true);
		expect(sig.pValue).toBeLessThan(0.001);
		expect(sig.ci95[0]).toBeGreaterThan(0);

		const barelyDifferent: GroupMeanStats = { group: 'A', n: 20, mean: 100.1, variance: 400 };
		const notSig = welchTTest(barelyDifferent, baseline, ALPHA);
		expect(notSig.significant).toBe(false);
		expect(notSig.ci95[0]).toBeLessThan(0);
		expect(notSig.ci95[1]).toBeGreaterThan(0);
	});
});

describe('twoProportionZTest', () => {
	it('returns zStat=0 and pValue=1 for identical proportions', () => {
		const a: GroupProportionStats = { group: 'A', n: 100, successes: 50 };
		const b: GroupProportionStats = { group: 'B', n: 100, successes: 50 };
		const result = twoProportionZTest(a, b, ALPHA);
		expect(result.zStat).toBeCloseTo(0, 6);
		expect(result.pValue).toBeCloseTo(1, 6);
		expect(result.significant).toBe(false);
	});

	it('matches the manual two-proportion z formula and its own p-value conversion', () => {
		const a: GroupProportionStats = { group: 'A', n: 100, successes: 60 };
		const b: GroupProportionStats = { group: 'B', n: 100, successes: 40 };
		const result = twoProportionZTest(a, b, ALPHA);

		const propA = 0.6;
		const propB = 0.4;
		const se = Math.sqrt((propA * (1 - propA)) / 100 + (propB * (1 - propB)) / 100);
		const expectedZ = (propA - propB) / se;

		expect(result.propA).toBeCloseTo(propA, 9);
		expect(result.propB).toBeCloseTo(propB, 9);
		expect(result.zStat).toBeCloseTo(expectedZ, 6);
		expect(result.pValue).toBeCloseTo(twoTailedPValueFromZ(expectedZ), 9);
		expect(result.significant).toBe(true);
		expect(result.ci95[0]).toBeGreaterThan(0); // clearly positive difference, CI excludes 0
	});

	it('is not significant for a small difference with modest sample size', () => {
		const a: GroupProportionStats = { group: 'A', n: 100, successes: 52 };
		const b: GroupProportionStats = { group: 'B', n: 100, successes: 48 };
		const result = twoProportionZTest(a, b, ALPHA);
		expect(result.significant).toBe(false);
		expect(result.ci95[0]).toBeLessThan(0);
		expect(result.ci95[1]).toBeGreaterThan(0);
	});
});
