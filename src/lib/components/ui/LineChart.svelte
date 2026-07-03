<script lang="ts">
	import ZoomableChart from './ZoomableChart.svelte';

	type DataPoint = { label: string; value: number };
	type Series = { name: string; data: DataPoint[] };

	type Props = {
		data?: DataPoint[];
		series?: Series[];
		title?: string;
		color?: string;
		/** 指定するとviewBoxの縦幅を上書きする（未指定時は従来通りラベル数から自動計算） */
		height?: number;
		/** 指定すると縦の基準線を描画する（データ点のインデックス。小数可＝2点の間に置ける） */
		markerIndex?: number;
		markerLabel?: string;
	};

	let { data, series, title, color = 'var(--chart-1)', height, markerIndex, markerLabel }: Props = $props();

	const COLORS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'];

	const allSeries = $derived<Series[]>(
		series && series.length > 0
			? series
			: data && data.length > 0
				? [{ name: '', data }]
				: []
	);

	const isMulti = $derived(allSeries.length > 1);
	const labels = $derived(allSeries[0]?.data.map((d) => d.label) ?? []);

	const maxVal = $derived(
		Math.max(...allSeries.flatMap((s) => s.data.map((d) => d.value)), 1)
	);

	const W = 680;
	const PL = 90;
	const PR = 16;
	const rotateLabs = $derived(labels.length > 10);
	// 日次粒度のトレンド予測等、点数が多い場合にラベル・ドットが埋め尽くさないよう間引く（少数点数の既存利用箇所は影響なし）
	const labelStep = $derived(Math.max(1, Math.ceil(labels.length / 15)));
	const showDots = $derived(labels.length <= 120);
	// height指定時（横長のダッシュボード用）は縦の余白も詰めて、単純な縮小ではなく横に広いアスペクト比にする
	const PT = $derived(height ? 10 : 16);
	const H = $derived(height ?? (rotateLabs ? 300 : 220));
	const PB = $derived(
		(isMulti ? (height ? 36 : 52) : (height ? 24 : 40)) + (rotateLabs ? (height ? 46 : 80) : 0)
	);
	const plotW = $derived(W - PL - PR);
	const plotH = $derived(H - PT - PB);

	function px(i: number, total: number): number {
		if (total === 1) return PL + plotW / 2;
		return PL + (i / (total - 1)) * plotW;
	}
	function py(v: number): number {
		return PT + (1 - v / maxVal) * plotH;
	}

	function seriesColor(si: number): string {
		// single series: respect the color prop for backward compat
		if (!isMulti) return color;
		return `var(${COLORS[si % COLORS.length]})`;
	}

	function makeLine(s: Series): string {
		return s.data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${px(i, s.data.length)} ${py(d.value)}`).join(' ');
	}

	function makeArea(s: Series): string {
		if (s.data.length <= 1) return '';
		const line = makeLine(s);
		const n = s.data.length;
		return `${line} L ${px(n - 1, n)} ${PT + plotH} L ${px(0, n)} ${PT + plotH} Z`;
	}

	const yTicks = $derived(
		[0, 0.25, 0.5, 0.75, 1].map((t) => ({
			y: PT + plotH * (1 - t),
			label: Math.round(maxVal * t).toLocaleString()
		}))
	);

	// unique gradient id per instance
	const baseId = Math.random().toString(36).slice(2, 7);
</script>

<ZoomableChart>
<figure class="chart">
	{#if title}<figcaption>{title}</figcaption>{/if}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={title}>
		<defs>
			{#each allSeries as _, si}
				<linearGradient id="lg-{baseId}-{si}" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color={seriesColor(si)} stop-opacity={isMulti ? 0.12 : 0.2} />
					<stop offset="100%" stop-color={seriesColor(si)} stop-opacity="0.02" />
				</linearGradient>
			{/each}
		</defs>

		<!-- Grid -->
		{#each yTicks as t}
			<line x1={PL} y1={t.y} x2={W - PR} y2={t.y}
				stroke="var(--color-border)" stroke-width="1" />
			<text x={PL - 6} y={t.y + 4} text-anchor="end"
				fill="var(--color-text-muted)" font-size="8">{t.label}</text>
		{/each}

		<!-- Area fills (drawn first, below lines) -->
		{#each allSeries as s, si}
			{#if s.data.length > 1}
				<path d={makeArea(s)} fill="url(#lg-{baseId}-{si})" />
			{/if}
		{/each}

		<!-- Lines -->
		{#each allSeries as s, si}
			<path d={makeLine(s)} fill="none" stroke={seriesColor(si)}
				stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
		{/each}

		<!-- Dots（点数が多い時は省略し、線だけで表現する） -->
		{#if showDots}
			{#each allSeries as s, si}
				{#each s.data as d, i}
					<circle cx={px(i, s.data.length)} cy={py(d.value)} r="2" fill={seriesColor(si)} />
				{/each}
			{/each}
		{/if}

		<!-- X-axis labels (from first series。点数が多い時は間引いて表示する) -->
		{#each labels as label, i}
			{#if i % labelStep === 0 || i === labels.length - 1}
				{@const lx = px(i, labels.length)}
				{@const ly = PT + plotH + 10}
				<text
					x={lx} y={ly}
					text-anchor={rotateLabs ? 'end' : 'middle'}
					fill="var(--color-text-muted)"
					font-size="8"
					transform={rotateLabs ? `rotate(-45 ${lx} ${ly})` : undefined}
				>{label}</text>
			{/if}
		{/each}

		<!-- Axes -->
		<line x1={PL} y1={PT} x2={PL} y2={PT + plotH}
			stroke="var(--color-border)" stroke-width="1" />
		<line x1={PL} y1={PT + plotH} x2={W - PR} y2={PT + plotH}
			stroke="var(--color-border)" stroke-width="1" />

		<!-- Marker (e.g. 実績/予測の境界) -->
		{#if markerIndex !== undefined && labels.length > 1}
			{@const mx = px(markerIndex, labels.length)}
			<line x1={mx} y1={PT} x2={mx} y2={PT + plotH}
				stroke="var(--color-text-muted)" stroke-width="1" stroke-dasharray="3 2" />
			{#if markerLabel}
				<text x={mx} y={PT + 9} text-anchor="middle" fill="var(--color-text-muted)" font-size="8">{markerLabel}</text>
			{/if}
		{/if}

		<!-- Legend (multi-series only) -->
		{#if isMulti}
			{@const itemW = W / allSeries.length}
			{#each allSeries as s, si}
				<line
					x1={si * itemW + (itemW - 60) / 2}
					y1={H - 7}
					x2={si * itemW + (itemW - 60) / 2 + 14}
					y2={H - 7}
					stroke={seriesColor(si)}
					stroke-width="1.5"
					stroke-linecap="round"
				/>
				<text x={si * itemW + (itemW - 60) / 2 + 18} y={H - 4}
					fill="var(--color-text-muted)" font-size="8">{s.name}</text>
			{/each}
		{/if}
	</svg>
</figure>
</ZoomableChart>

<style lang="scss">
	.chart { display: flex; flex-direction: column; gap: 6px; margin: 0; }
	figcaption { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); }
	svg { width: 100%; height: auto; }
</style>
