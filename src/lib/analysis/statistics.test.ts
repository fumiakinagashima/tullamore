import { describe, it, expect } from 'vitest';
import { normalCDF, studentTCDF, studentTInverseCDF, twoTailedPValueFromT, twoTailedPValueFromZ, normalInverseCDF } from './statistics';

describe('normalCDF', () => {
	it('matches well-known standard normal values', () => {
		expect(normalCDF(0)).toBeCloseTo(0.5, 6);
		expect(normalCDF(1.959964)).toBeCloseTo(0.975, 4);
		expect(normalCDF(-1.959964)).toBeCloseTo(0.025, 4);
		expect(normalCDF(2.575829)).toBeCloseTo(0.995, 4);
	});
});

describe('normalInverseCDF', () => {
	it('is the inverse of normalCDF at common significance levels', () => {
		expect(normalInverseCDF(0.975)).toBeCloseTo(1.959964, 3);
		expect(normalInverseCDF(0.995)).toBeCloseTo(2.575829, 3);
		expect(normalInverseCDF(0.5)).toBeCloseTo(0, 6);
	});
});

describe('studentTCDF', () => {
	// Reference two-tailed critical values from a standard t-table (P = 0.05 and 0.01)
	it('matches standard t-table critical values at alpha=0.05 (two-tailed)', () => {
		const cases: [df: number, critical: number][] = [
			[1, 12.706],
			[5, 2.571],
			[10, 2.228],
			[30, 2.042],
			[120, 1.98]
		];
		for (const [df, critical] of cases) {
			const p = twoTailedPValueFromT(critical, df);
			expect(p).toBeCloseTo(0.05, 2);
		}
	});

	it('matches standard t-table critical values at alpha=0.01 (two-tailed)', () => {
		const cases: [df: number, critical: number][] = [
			[10, 3.169],
			[30, 2.75]
		];
		for (const [df, critical] of cases) {
			const p = twoTailedPValueFromT(critical, df);
			expect(p).toBeCloseTo(0.01, 2);
		}
	});

	it('approaches the normal distribution as df grows large', () => {
		const pT = twoTailedPValueFromT(1.959964, 100000);
		expect(pT).toBeCloseTo(0.05, 2);
	});

	it('is 1 at t=0 and symmetric around 0', () => {
		expect(studentTCDF(0, 10)).toBeCloseTo(0.5, 6);
		expect(studentTCDF(2, 10)).toBeCloseTo(1 - studentTCDF(-2, 10), 6);
	});
});

describe('studentTInverseCDF', () => {
	it('matches standard t-table critical values (two-tailed 0.975 quantile)', () => {
		const cases: [df: number, critical: number][] = [
			[1, 12.706],
			[5, 2.571],
			[10, 2.228],
			[30, 2.042]
		];
		for (const [df, critical] of cases) {
			expect(studentTInverseCDF(0.975, df)).toBeCloseTo(critical, 2);
		}
	});

	it('is the inverse of studentTCDF', () => {
		const t = studentTInverseCDF(0.9, 15);
		expect(studentTCDF(t, 15)).toBeCloseTo(0.9, 4);
	});

	it('returns 0 at p=0.5', () => {
		expect(studentTInverseCDF(0.5, 20)).toBe(0);
	});
});

describe('twoTailedPValueFromZ', () => {
	it('matches the classic 1.96 -> 0.05 relationship', () => {
		expect(twoTailedPValueFromZ(1.959964)).toBeCloseTo(0.05, 3);
	});

	it('is 1 at z=0', () => {
		expect(twoTailedPValueFromZ(0)).toBeCloseTo(1, 6);
	});
});
