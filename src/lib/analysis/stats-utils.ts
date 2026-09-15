export type HistogramBin = { binStart: number; binEnd: number; count: number };

/** Linear interpolation percentile over a sorted array (same method as the Excel/NumPy default) */
export function percentile(sorted: number[], p: number): number {
	if (sorted.length === 1) return sorted[0];
	const index = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sorted[lower];
	const frac = index - lower;
	return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

/** Builds an equal-width-bin histogram (min/max are passed in by the caller from the sorted array) */
export function buildHistogram(values: number[], min: number, max: number, binCount: number): HistogramBin[] {
	const binWidth = (max - min) / binCount || 1;
	const histogram: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
		binStart: min + i * binWidth,
		binEnd: min + (i + 1) * binWidth,
		count: 0
	}));
	for (const v of values) {
		const idx = Math.min(binCount - 1, Math.floor((v - min) / binWidth));
		histogram[idx].count++;
	}
	return histogram;
}
