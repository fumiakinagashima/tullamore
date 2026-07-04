import { twoTailedPValueFromT, twoTailedPValueFromZ, studentTInverseCDF, normalInverseCDF } from './statistics';

export type GroupMeanStats = { group: string; n: number; mean: number; variance: number };
export type GroupProportionStats = { group: string; n: number; successes: number };

export type TTestResult = {
	kind: 'mean';
	groupA: GroupMeanStats;
	groupB: GroupMeanStats;
	meanDiff: number;
	tStat: number;
	df: number;
	pValue: number;
	ci95: [number, number];
	significant: boolean;
};

export type ProportionTestResult = {
	kind: 'proportion';
	groupA: GroupProportionStats;
	groupB: GroupProportionStats;
	propA: number;
	propB: number;
	diff: number;
	zStat: number;
	pValue: number;
	ci95: [number, number];
	significant: boolean;
};

/**
 * Welchのt検定（等分散を仮定しない2標本の平均の差の検定）。A/Bテストで「施策Aと施策Bで
 * 平均値（購入額など連続値の指標）に有意差があるか」を調べるのに使う。
 */
export function welchTTest(a: GroupMeanStats, b: GroupMeanStats, alpha: number): TTestResult {
	const seA2 = a.variance / a.n;
	const seB2 = b.variance / b.n;
	const se = Math.sqrt(seA2 + seB2);
	const meanDiff = a.mean - b.mean;
	const tStat = se === 0 ? 0 : meanDiff / se;

	// Welch–Satterthwaite の自由度
	const df =
		seA2 === 0 && seB2 === 0
			? a.n + b.n - 2
			: (seA2 + seB2) ** 2 / ((seA2 * seA2) / (a.n - 1) + (seB2 * seB2) / (b.n - 1));

	const pValue = twoTailedPValueFromT(tStat, df);
	const tCrit = studentTInverseCDF(1 - alpha / 2, df);
	const margin = tCrit * se;

	return {
		kind: 'mean',
		groupA: a,
		groupB: b,
		meanDiff,
		tStat,
		df,
		pValue,
		ci95: [meanDiff - margin, meanDiff + margin],
		significant: pValue < alpha
	};
}

/**
 * 2標本の比率のz検定（不等分散を仮定、Welchのt検定と対になる標準的な手法）。
 * 「施策Aと施策Bでコンバージョン率に有意差があるか」のような2値指標に使う。
 * z²はこの2群比較において2×2のカイ二乗検定の統計量と数学的に同値（p値も一致する）。
 */
export function twoProportionZTest(a: GroupProportionStats, b: GroupProportionStats, alpha: number): ProportionTestResult {
	const propA = a.successes / a.n;
	const propB = b.successes / b.n;
	const diff = propA - propB;

	// 不等分散（unpooled）の標準誤差を使う（信頼区間はこちらが標準的）
	const seA2 = (propA * (1 - propA)) / a.n;
	const seB2 = (propB * (1 - propB)) / b.n;
	const se = Math.sqrt(seA2 + seB2);
	const zStat = se === 0 ? 0 : diff / se;
	const pValue = twoTailedPValueFromZ(zStat);

	const zCrit = normalInverseCDF(1 - alpha / 2);
	const margin = zCrit * se;

	return {
		kind: 'proportion',
		groupA: a,
		groupB: b,
		propA,
		propB,
		diff,
		zStat,
		pValue,
		ci95: [diff - margin, diff + margin],
		significant: pValue < alpha
	};
}
