import type { SufficientStats } from './types';

/** サマリー統計量からピアソンの相関係数を計算する（生データを読み込まない） */
export function pearsonCorrelation(stats: SufficientStats, targetColumn: string, featureColumn: string): number {
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
	targetColumn: string,
	featureColumns: string[]
): { column: string; correlation: number }[] {
	return featureColumns
		.map((column) => ({ column, correlation: pearsonCorrelation(stats, targetColumn, column) }))
		.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}
