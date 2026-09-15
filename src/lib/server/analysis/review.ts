import { maxFeaturePairCorrelation } from '$lib/analysis/correlation';
import type { LinearRegressionModel } from '$lib/analysis/types';
import { assessFitQuality, assessSampleSizeAdequacy } from '$lib/analysis/validity';
import { computeSufficientStats } from './sufficient-stats';

export type SimulatorReview = {
	fitQuality: 'excellent' | 'good' | 'moderate' | 'weak';
	fitComment: string;
	sampleSizeAdequacy: 'sufficient' | 'marginal' | 'insufficient';
	sampleSizeComment: string;
	multicollinearity: { columnA: string; columnB: string; correlation: number } | null;
	multicollinearityComment: string | null;
	overallComment: string;
};

// Maps $lib/analysis/validity.ts's ValidityLevel (good/caution/poor) onto this function's existing
// vocabulary (excellent/good/moderate/weak, sufficient/marginal/insufficient).
// Since SimulatorReview is a type already consumed by the review_simulator MCP tool and /simulators/[id],
// we share the underlying assessment logic while keeping its externally visible shape unchanged
function assessFit(r2: number): { fitQuality: SimulatorReview['fitQuality']; fitComment: string } {
	const { level, comment } = assessFitQuality(r2);
	const fitQuality = level === 'poor' ? 'weak' : r2 >= 0.8 ? 'excellent' : level === 'good' ? 'good' : 'moderate';
	return { fitQuality, fitComment: comment };
}

function assessSampleSize(
	sampleSize: number,
	featureCount: number
): { sampleSizeAdequacy: SimulatorReview['sampleSizeAdequacy']; sampleSizeComment: string } {
	const { level, comment } = assessSampleSizeAdequacy(sampleSize, featureCount);
	const sampleSizeAdequacy = level === 'good' ? 'sufficient' : level === 'caution' ? 'marginal' : 'insufficient';
	return { sampleSizeAdequacy, sampleSizeComment: comment };
}

/**
 * Checks the validity of a simulator. Evaluates goodness of fit (R²), sample size
 * adequacy, and multicollinearity among the feature variables. The correlation
 * coefficients needed to assess multicollinearity are computed from summary
 * statistics (Σx, Σxᵢxⱼ); the raw data is never read.
 */
export async function reviewSimulator(
	db: D1Database,
	tableName: string,
	model: LinearRegressionModel
): Promise<SimulatorReview> {
	const { fitQuality, fitComment } = assessFit(model.metrics.r2);
	const { sampleSizeAdequacy, sampleSizeComment } = assessSampleSize(
		model.metrics.sampleSize,
		model.featureColumns.length
	);

	let multicollinearity: SimulatorReview['multicollinearity'] = null;
	let multicollinearityComment: string | null = null;
	if (model.featureColumns.length >= 2) {
		const stats = await computeSufficientStats(db, tableName, model.targetColumn, model.featureColumns);
		multicollinearity = maxFeaturePairCorrelation(stats, model.featureColumns);
		if (multicollinearity && Math.abs(multicollinearity.correlation) >= 0.9) {
			multicollinearityComment = `Feature variables "${multicollinearity.columnA}" and "${multicollinearity.columnB}" are very strongly correlated (r=${multicollinearity.correlation.toFixed(3)}), suggesting multicollinearity. Consider excluding one of them, or interpret the coefficients with caution`;
		} else if (multicollinearity && Math.abs(multicollinearity.correlation) >= 0.7) {
			multicollinearityComment = `Feature variables "${multicollinearity.columnA}" and "${multicollinearity.columnB}" are somewhat strongly correlated (r=${multicollinearity.correlation.toFixed(3)}). Watch out for multicollinearity`;
		}
	}

	const overallComment =
		fitQuality === 'weak' || sampleSizeAdequacy === 'insufficient'
			? 'Treat this simulator\'s predictions as a reference only, and confirm important decisions with other supporting evidence'
			: multicollinearityComment
				? 'Basic accuracy is adequate, but be mindful of the correlation among the feature variables'
				: 'This simulator found no issues on the main validity check criteria';

	return { fitQuality, fitComment, sampleSizeAdequacy, sampleSizeComment, multicollinearity, multicollinearityComment, overallComment };
}
