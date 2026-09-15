import { percentile, buildHistogram, type HistogramBin } from './stats-utils';
import { combineOverall, type ValidityAssessment, type ValidityCheckItem } from './validity';

/** Exact summary statistics for a single column, derived from SQL aggregates (no raw data needed) */
export type ColumnAggregates = { n: number; sum: number; sumSq: number; min: number; max: number };

export type DescriptiveStatsSummary = {
	n: number;
	mean: number;
	stddev: number;
	min: number;
	max: number;
	median: number;
	q1: number;
	q3: number;
	iqr: number;
	histogram: HistogramBin[];
	/** Number of samples used to compute the median, quartiles, and histogram (at most n) */
	sampleSize: number;
	/** True if the sample count was capped below the population count (n). Median etc. are then approximate */
	sampled: boolean;
	/** Count of outlier candidates (within the sample) found using the IQR method (outside [Q1-1.5*IQR, Q3+1.5*IQR]) */
	outlierCount: number;
	validity: ValidityAssessment;
};

/**
 * n/mean/stddev/min/max are computed exactly from the SQL aggregates (aggregates)
 * (using the identity Sigma(x-mean)^2 = Sigma(x^2) - n*mean^2, variance can be derived without reading the raw data).
 * The median, quartiles, and histogram can only be computed from a sample of the raw data (sample, capped), so they may be approximate.
 */
export function computeDescriptiveStats(
	aggregates: ColumnAggregates,
	sample: number[],
	histogramBins: number
): DescriptiveStatsSummary {
	const { n, sum, sumSq, min, max } = aggregates;
	const mean = sum / n;
	const variance = n > 1 ? Math.max(0, sumSq - n * mean * mean) / (n - 1) : 0;
	const stddev = Math.sqrt(variance);

	const sorted = [...sample].sort((a, b) => a - b);
	const median = percentile(sorted, 50);
	const q1 = percentile(sorted, 25);
	const q3 = percentile(sorted, 75);
	const iqr = q3 - q1;
	const histogram = buildHistogram(sample, min, max, histogramBins);

	const lowerFence = q1 - 1.5 * iqr;
	const upperFence = q3 + 1.5 * iqr;
	const outlierCount = sample.filter((v) => v < lowerFence || v > upperFence).length;

	const sampled = sample.length < n;
	const checks: ValidityCheckItem[] = [];
	if (n >= 30) {
		checks.push({ label: 'Sample count', level: 'good', comment: `${n} records is enough to understand the distribution` });
	} else if (n >= 10) {
		checks.push({ label: 'Sample count', level: 'caution', comment: `${n} records is a bit low; interpret the distribution with caution (recommended: 30+)` });
	} else {
		checks.push({ label: 'Sample count', level: 'poor', comment: `${n} records is insufficient; the reliability of these statistics may be low (recommended: 30+)` });
	}
	if (sampled) {
		checks.push({
			label: 'Median/quartile precision',
			level: 'caution',
			comment: `Approximate values based on a sample of the first ${sample.length.toLocaleString()} of ${n.toLocaleString()} total records`
		});
	}
	const { overallLevel, overallComment } = combineOverall(checks, 'No issues were found on the main validity-check criteria for these statistics');

	return {
		n,
		mean,
		stddev,
		min,
		max,
		median,
		q1,
		q3,
		iqr,
		histogram,
		sampleSize: sample.length,
		sampled,
		outlierCount,
		validity: { overallLevel, overallComment, checks }
	};
}
