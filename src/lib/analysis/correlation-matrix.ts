import type { SufficientStats } from './types';
import { pearsonCorrelation, featurePairCorrelation } from './correlation';
import { combineOverall, type ValidityAssessment, type ValidityCheckItem } from './validity';

export type CorrelationMatrix = {
	columns: string[];
	/** matrix[i][j] = Pearson correlation coefficient between columns[i] and columns[j] (symmetric, diagonal is 1) */
	matrix: number[][];
	/** Sample size used to compute the correlations (number of rows where all columns are non-NULL) */
	sampleSize: number;
};

/**
 * Builds the correlation matrix for all column pairs from the result of calling computeSufficientStats
 * with columns[0] as the "target variable" and the rest as "feature variables". This can be derived purely
 * from the existing summary statistics (Σx, Σxᵢxⱼ, etc.), so no new SQL aggregation is needed
 * (pairs with columns[0] use pearsonCorrelation, other pairs use featurePairCorrelation).
 */
export function buildCorrelationMatrix(stats: SufficientStats, columns: string[]): CorrelationMatrix {
	const n = columns.length;
	const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(1));

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const corr = i === 0 ? pearsonCorrelation(stats, columns[j]) : featurePairCorrelation(stats, columns[i], columns[j]);
			matrix[i][j] = corr;
			matrix[j][i] = corr;
		}
	}

	return { columns, matrix, sampleSize: stats.n };
}

/** Assesses the validity of a correlation matrix. A small sample size makes the correlation coefficient estimate unstable, so that is the one thing checked. */
export function assessCorrelationValidity(result: CorrelationMatrix): ValidityAssessment {
	const checks: ValidityCheckItem[] = [];
	const n = result.sampleSize;

	if (n >= 30) {
		checks.push({ label: 'Sample size', level: 'good', comment: `A sample size of ${n} is sufficient for estimating correlation coefficients` });
	} else if (n >= 10) {
		checks.push({ label: 'Sample size', level: 'caution', comment: `A sample size of ${n} is a bit small, so correlation coefficients tend to be unstable (guideline: 30 or more)` });
	} else {
		checks.push({ label: 'Sample size', level: 'poor', comment: `A sample size of ${n} is insufficient; the correlation coefficients may not be reliable (guideline: 30 or more)` });
	}

	const { overallLevel, overallComment } = combineOverall(
		checks,
		'No issues were found in the main aspects of the validity check for this correlation analysis'
	);
	return { overallLevel, overallComment, checks };
}
