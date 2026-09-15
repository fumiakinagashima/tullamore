import { maxFeaturePairCorrelation } from '$lib/analysis/correlation';
import type { LinearRegressionModel } from '$lib/analysis/types';
import {
	assessFitQuality,
	assessSampleSizeAdequacy,
	combineOverall,
	type ValidityAssessment,
	type ValidityCheckItem
} from '$lib/analysis/validity';
import { computeSufficientStats } from './sufficient-stats';

/**
 * Assess the validity of a regression-based model (any linear combination model, including
 * derivatives of linear/logistic regression). Checks fit (R²), sample size adequacy, and
 * multicollinearity between feature variables.
 * The judgment logic is shared with `review.ts` (for persistent simulators created via chat)
 * through `$lib/analysis/validity.ts`, but this one returns the generic ValidityAssessment
 * format used by the sidebar `/analysis/*` analysis modules.
 *
 * Multicollinearity is a concern about the reliability of "coefficient interpretation," which
 * is a different kind of issue from fit/sample size (i.e. the reliability of the prediction
 * itself), so it caps the overall assessment at 'caution' rather than raising it to the
 * strictest 'poor' (following the existing weighting in review.ts).
 */
export async function assessRegressionValidity(
	db: D1Database,
	tableName: string,
	model: LinearRegressionModel
): Promise<ValidityAssessment> {
	const checks: ValidityCheckItem[] = [
		assessFitQuality(model.metrics.r2),
		assessSampleSizeAdequacy(model.metrics.sampleSize, model.featureColumns.length)
	];

	if (model.featureColumns.length >= 2) {
		const stats = await computeSufficientStats(db, tableName, model.targetColumn, model.featureColumns);
		const pair = maxFeaturePairCorrelation(stats, model.featureColumns);
		if (pair) {
			const abs = Math.abs(pair.correlation);
			if (abs >= 0.9) {
				checks.push({
					label: 'Multicollinearity',
					level: 'caution',
					comment: `The feature variables "${pair.columnA}" and "${pair.columnB}" are very strongly correlated (r=${pair.correlation.toFixed(3)}), suggesting possible multicollinearity. Consider excluding one of them, or interpret the coefficients with caution`
				});
			} else if (abs >= 0.7) {
				checks.push({
					label: 'Multicollinearity',
					level: 'caution',
					comment: `The feature variables "${pair.columnA}" and "${pair.columnB}" are somewhat strongly correlated (r=${pair.correlation.toFixed(3)}). Watch out for multicollinearity`
				});
			} else {
				checks.push({ label: 'Multicollinearity', level: 'good', comment: 'No strong correlation was found between the feature variables' });
			}
		}
	}

	const { overallLevel, overallComment } = combineOverall(
		checks,
		'No issues were found in the main aspects of the validity check for this analysis result'
	);
	return { overallLevel, overallComment, checks };
}
