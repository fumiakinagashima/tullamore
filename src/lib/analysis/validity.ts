// Shared "validity check" types across analysis modules, plus the parts of the judging logic that
// are pure and don't depend on the DB. Checks that need summary statistics, like multicollinearity,
// are handled by server/analysis/validity.ts (which depends on D1).

export type ValidityLevel = 'good' | 'caution' | 'poor';

export type ValidityCheckItem = {
	/** Check item name (e.g. "Goodness of fit") */
	label: string;
	level: ValidityLevel;
	comment: string;
};

export type ValidityAssessment = {
	overallLevel: ValidityLevel;
	overallComment: string;
	checks: ValidityCheckItem[];
};

/** Evaluates goodness of fit from the R² coefficient of determination (same thresholds as assessFit in review.ts) */
export function assessFitQuality(r2: number): ValidityCheckItem {
	if (r2 >= 0.8) return { label: 'Goodness of fit', level: 'good', comment: `R²=${r2.toFixed(3)}, the fit is excellent` };
	if (r2 >= 0.5) return { label: 'Goodness of fit', level: 'good', comment: `R²=${r2.toFixed(3)}, the fit is good` };
	if (r2 >= 0.3) return { label: 'Goodness of fit', level: 'caution', comment: `R²=${r2.toFixed(3)}, the fit is somewhat weak — treat the results as a reference only` };
	return { label: 'Goodness of fit', level: 'poor', comment: `R²=${r2.toFixed(3)}, the fit is weak — these explanatory variables do not predict well enough` };
}

/**
 * Evaluates whether the sample size is sufficient relative to the number of explanatory variables (parameters).
 * The rule of thumb is "10x the parameter count or more" (the same heuristic as assessSampleSize in review.ts).
 */
export function assessSampleSizeAdequacy(sampleSize: number, paramCount: number): ValidityCheckItem {
	const ideal = 10 * (paramCount + 1);
	const marginal = 5 * (paramCount + 1);
	if (sampleSize >= ideal) {
		return { label: 'Sample size', level: 'good', comment: `A sample size of ${sampleSize} is sufficient for ${paramCount} explanatory variable(s)` };
	}
	if (sampleSize >= marginal) {
		return {
			label: 'Sample size',
			level: 'caution',
			comment: `A sample size of ${sampleSize} is somewhat small for ${paramCount} explanatory variable(s) (guideline: ${ideal}+). Adding more data would improve reliability`
		};
	}
	return {
		label: 'Sample size',
		level: 'poor',
		comment: `A sample size of ${sampleSize} is insufficient for ${paramCount} explanatory variable(s) (guideline: ${ideal}+). Coefficient reliability may be low`
	};
}

/** Summarizes the overall validity level and comment from individual check results */
export function combineOverall(checks: ValidityCheckItem[], goodComment: string): { overallLevel: ValidityLevel; overallComment: string } {
	if (checks.some((c) => c.level === 'poor')) {
		return {
			overallLevel: 'poor',
			overallComment: 'Treat this analysis as a reference only, and confirm important decisions with other supporting evidence'
		};
	}
	if (checks.some((c) => c.level === 'caution')) {
		return {
			overallLevel: 'caution',
			overallComment: 'Basic validity is established, but some items warrant caution'
		};
	}
	return { overallLevel: 'good', overallComment: goodComment };
}
