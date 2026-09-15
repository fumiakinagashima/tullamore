<script lang="ts">
	type Point = { x: number; y: number; label?: string };
	type Series = { name: string; points: Point[] };

	type Props = {
		points?: Point[];
		series?: Series[];
		title?: string;
		xLabel?: string;
		yLabel?: string;
	};

	let { points, series, title, xLabel, yLabel }: Props = $props();

	const COLORS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'];

	const allSeries = $derived<Series[]>(
		series && series.length > 0 ? series : points && points.length > 0 ? [{ name: '', points }] : []
	);
	const isMulti = $derived(allSeries.length > 1);
	const allPoints = $derived(allSeries.flatMap((s) => s.points));

	// The 0/1 fallback is only used when allPoints is empty and Math.min/max would be Infinity
	// (always including 0 would compress data far from zero, e.g. ad spend ranging from 60k to 160k,
	// into the right edge and make the scatter plot look broken)
	const xMin = $derived(allPoints.length > 0 ? Math.min(...allPoints.map((p) => p.x)) : 0);
	const xMax = $derived(allPoints.length > 0 ? Math.max(...allPoints.map((p) => p.x)) : 1);
	const yMin = $derived(allPoints.length > 0 ? Math.min(...allPoints.map((p) => p.y)) : 0);
	const yMax = $derived(allPoints.length > 0 ? Math.max(...allPoints.map((p) => p.y)) : 1);

	const W = 680;
	const PL = 90;
	const PR = 16;
	const PT = 16;
	const PB = 40;
	const plotW = W - PL - PR;
	const H = 320;
	const plotH = H - PT - PB;

	function px(x: number): number {
		const span = xMax - xMin || 1;
		return PL + ((x - xMin) / span) * plotW;
	}
	function py(y: number): number {
		const span = yMax - yMin || 1;
		return PT + (1 - (y - yMin) / span) * plotH;
	}

	function seriesColor(si: number): string {
		return `var(${COLORS[si % COLORS.length]})`;
	}

	const xTicks = $derived(
		[0, 0.25, 0.5, 0.75, 1].map((t) => ({ x: PL + plotW * t, label: Math.round(xMin + (xMax - xMin) * t).toLocaleString() }))
	);
	const yTicks = $derived(
		[0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: PT + plotH * (1 - t), label: Math.round(yMin + (yMax - yMin) * t).toLocaleString() }))
	);
</script>

<figure class="chart">
	{#if title}<figcaption>{title}</figcaption>{/if}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={title}>
		<!-- Grid -->
		{#each yTicks as t, i (i)}
			<line x1={PL} y1={t.y} x2={W - PR} y2={t.y} stroke="var(--color-border)" stroke-width="1" />
			<text x={PL - 6} y={t.y + 4} text-anchor="end" fill="var(--color-text-muted)" font-size="8">{t.label}</text>
		{/each}
		{#each xTicks as t, i (i)}
			<text x={t.x} y={PT + plotH + 16} text-anchor="middle" fill="var(--color-text-muted)" font-size="8">{t.label}</text>
		{/each}

		<!-- Points -->
		{#each allSeries as s, si (s.name + si)}
			{#each s.points as p, pi (pi)}
				<circle cx={px(p.x)} cy={py(p.y)} r="4" fill={seriesColor(si)} fill-opacity="0.75">
					{#if p.label}<title>{p.label}</title>{/if}
				</circle>
			{/each}
		{/each}

		<!-- Axes -->
		<line x1={PL} y1={PT} x2={PL} y2={PT + plotH} stroke="var(--color-border)" stroke-width="1" />
		<line x1={PL} y1={PT + plotH} x2={W - PR} y2={PT + plotH} stroke="var(--color-border)" stroke-width="1" />

		{#if xLabel}
			<text x={PL + plotW / 2} y={H - 4} text-anchor="middle" fill="var(--color-text-muted)" font-size="8">{xLabel}</text>
		{/if}
		{#if yLabel}
			<text x={12} y={PT + plotH / 2} text-anchor="middle" fill="var(--color-text-muted)" font-size="8" transform="rotate(-90 12 {PT + plotH / 2})">{yLabel}</text>
		{/if}

		<!-- Legend (multi-series only) -->
		{#if isMulti}
			{@const itemW = W / allSeries.length}
			{#each allSeries as s, si (s.name + si)}
				<circle cx={si * itemW + (itemW - 60) / 2} cy={H - 7} r="4" fill={seriesColor(si)} />
				<text x={si * itemW + (itemW - 60) / 2 + 10} y={H - 3} fill="var(--color-text-muted)" font-size="8">{s.name}</text>
			{/each}
		{/if}
	</svg>
</figure>

<style lang="scss">
	.chart { display: flex; flex-direction: column; gap: 6px; margin: 0; }
	figcaption { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); }
	svg { width: 100%; height: auto; }
</style>
