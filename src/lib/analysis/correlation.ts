import type { SufficientStats } from './types';

/** Computes the Pearson correlation coefficient between the target variable (stats.targetSum, etc.) and the given feature variable from summary statistics (without reading the raw data) */
export function pearsonCorrelation(stats: SufficientStats, featureColumn: string): number {
	const n = stats.n;
	const sumX = stats.featureSums[featureColumn] ?? 0;
	const sumY = stats.targetSum;
	const sumXY = stats.featureTargetSums[featureColumn] ?? 0;
	const sumXX = stats.featureCrossSums[featureColumn]?.[featureColumn] ?? 0;
	const sumYY = stats.targetSumSq;

	const numerator = n * sumXY - sumX * sumY;
	const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
	if (denominator === 0) return 0;
	return numerator / denominator;
}

export function rankFeaturesByCorrelation(
	stats: SufficientStats,
	featureColumns: string[]
): { column: string; correlation: number }[] {
	return featureColumns
		.map((column) => ({ column, correlation: pearsonCorrelation(stats, column) }))
		.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

/** Computes the correlation coefficient between two feature variables (for multicollinearity checks; a feature-to-feature pair, not target-to-feature) */
export function featurePairCorrelation(stats: SufficientStats, colA: string, colB: string): number {
	if (colA === colB) return 1;
	const n = stats.n;
	const sumA = stats.featureSums[colA] ?? 0;
	const sumB = stats.featureSums[colB] ?? 0;
	const sumAB = stats.featureCrossSums[colA]?.[colB] ?? stats.featureCrossSums[colB]?.[colA] ?? 0;
	const sumAA = stats.featureCrossSums[colA]?.[colA] ?? 0;
	const sumBB = stats.featureCrossSums[colB]?.[colB] ?? 0;

	const numerator = n * sumAB - sumA * sumB;
	const denominator = Math.sqrt((n * sumAA - sumA * sumA) * (n * sumBB - sumB * sumB));
	if (denominator === 0) return 0;
	return numerator / denominator;
}

/** Returns the feature variable pair with the largest absolute correlation coefficient among all pairs (null if fewer than 2 variables) */
export function maxFeaturePairCorrelation(
	stats: SufficientStats,
	featureColumns: string[]
): { columnA: string; columnB: string; correlation: number } | null {
	let max: { columnA: string; columnB: string; correlation: number } | null = null;
	for (let i = 0; i < featureColumns.length; i++) {
		for (let j = i + 1; j < featureColumns.length; j++) {
			const correlation = featurePairCorrelation(stats, featureColumns[i], featureColumns[j]);
			if (!max || Math.abs(correlation) > Math.abs(max.correlation)) {
				max = { columnA: featureColumns[i], columnB: featureColumns[j], correlation };
			}
		}
	}
	return max;
}
