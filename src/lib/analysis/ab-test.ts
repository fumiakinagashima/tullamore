import { twoTailedPValueFromT, twoTailedPValueFromZ, studentTInverseCDF, normalInverseCDF } from './statistics';
import { combineOverall, type ValidityAssessment, type ValidityCheckItem } from './validity';

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
 * Welch's t-test (a two-sample test of difference in means that does not assume equal variance).
 * Used in A/B tests to check "is there a significant difference in the mean (e.g. a continuous
 * metric like purchase amount) between treatment A and treatment B?"
 */
export function welchTTest(a: GroupMeanStats, b: GroupMeanStats, alpha: number): TTestResult {
	const seA2 = a.variance / a.n;
	const seB2 = b.variance / b.n;
	const se = Math.sqrt(seA2 + seB2);
	const meanDiff = a.mean - b.mean;
	const tStat = se === 0 ? 0 : meanDiff / se;

	// Welch–Satterthwaite degrees of freedom
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
 * Two-sample z-test for proportions (assumes unequal variance; the standard counterpart to
 * Welch's t-test). Used for binary metrics such as "is there a significant difference in
 * conversion rate between treatment A and treatment B?"
 * In this two-group comparison, z² is mathematically equivalent to the 2x2 chi-squared test
 * statistic (the p-values match as well).
 */
export function twoProportionZTest(a: GroupProportionStats, b: GroupProportionStats, alpha: number): ProportionTestResult {
	const propA = a.successes / a.n;
	const propB = b.successes / b.n;
	const diff = propA - propB;

	// Use the unpooled (unequal-variance) standard error (this is the standard choice for the confidence interval)
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

/**
 * Assesses the validity of a test result. In addition to sample size adequacy (rule of thumb:
 * at least 30 per group), for proportion tests it also checks the condition needed for the
 * normal approximation to hold (expected count of successes/failures at least 5 in each group —
 * the standard heuristic for approximating a binomial distribution with a normal distribution).
 */
export function assessAbTestValidity(result: TTestResult | ProportionTestResult): ValidityAssessment {
	const checks: ValidityCheckItem[] = [];
	const minN = Math.min(result.groupA.n, result.groupB.n);

	if (minN >= 30) {
		checks.push({ label: 'Sample size', level: 'good', comment: `Both groups have a sufficient sample size (minimum n=${minN})` });
	} else if (minN >= 10) {
		checks.push({
			label: 'Sample size',
			level: 'caution',
			comment: `Sample size is somewhat small (minimum n=${minN}). The recommended minimum is 30 per group`
		});
	} else {
		checks.push({
			label: 'Sample size',
			level: 'poor',
			comment: `Sample size is insufficient (minimum n=${minN}). The reliability of the test result may be low (recommended minimum: 30 per group)`
		});
	}

	if (result.kind === 'proportion') {
		const aOk = result.groupA.n * result.propA >= 5 && result.groupA.n * (1 - result.propA) >= 5;
		const bOk = result.groupB.n * result.propB >= 5 && result.groupB.n * (1 - result.propB) >= 5;
		if (aOk && bOk) {
			checks.push({
				label: 'Validity of normal approximation',
				level: 'good',
				comment: 'Both groups meet the condition for a valid normal approximation (expected count of successes and failures both at least 5)'
			});
		} else {
			checks.push({
				label: 'Validity of normal approximation',
				level: 'caution',
				comment: 'The count of successes or failures is low, which may reduce the accuracy of the p-value based on the normal approximation'
			});
		}
	}

	const { overallLevel, overallComment } = combineOverall(
		checks,
		'No issues were found on the main validity check criteria for this test'
	);
	return { overallLevel, overallComment, checks };
}
