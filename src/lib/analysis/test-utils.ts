import type { SufficientStats } from './types';

/**
 * SQLのSUM集計が返すはずの値を、生の行データからテスト用に計算するヘルパー
 * （本番コードは src/lib/server/analysis/sufficient-stats.ts が D1 に対して1クエリで行う）。
 */
export function statsFromRows(
	rows: Record<string, number>[],
	targetColumn: string,
	featureColumns: string[]
): SufficientStats {
	const n = rows.length;
	let targetSum = 0;
	let targetSumSq = 0;
	const featureSums: Record<string, number> = {};
	const featureTargetSums: Record<string, number> = {};
	const featureCrossSums: Record<string, Record<string, number>> = {};
	const featureMin: Record<string, number> = {};
	const featureMax: Record<string, number> = {};

	for (const col of featureColumns) {
		featureSums[col] = 0;
		featureTargetSums[col] = 0;
		featureCrossSums[col] = {};
		for (const other of featureColumns) featureCrossSums[col][other] = 0;
		featureMin[col] = Infinity;
		featureMax[col] = -Infinity;
	}

	for (const row of rows) {
		const y = row[targetColumn];
		targetSum += y;
		targetSumSq += y * y;
		for (const col of featureColumns) {
			const x = row[col];
			featureSums[col] += x;
			featureTargetSums[col] += x * y;
			featureMin[col] = Math.min(featureMin[col], x);
			featureMax[col] = Math.max(featureMax[col], x);
			for (const other of featureColumns) {
				featureCrossSums[col][other] += x * row[other];
			}
		}
	}

	return { n, targetSum, targetSumSq, featureSums, featureTargetSums, featureCrossSums, featureMin, featureMax };
}
