<script lang="ts">
	type Bar = { label: string; low: number; high: number };

	type Props = {
		bars: Bar[];
		base: number;
		title?: string;
	};

	let { bars, base, title }: Props = $props();

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	const W = 680;
	const PL = 140;
	const PR = 170;
	const PT = 12;
	const ROW_H = 34;
	const PB = 24;
	const H = $derived(PT + bars.length * ROW_H + PB);
	const plotW = $derived(W - PL - PR);

	const domainMin = $derived(Math.min(base, ...bars.map((b) => b.low)));
	const domainMax = $derived(Math.max(base, ...bars.map((b) => b.high)));
	const span = $derived(domainMax - domainMin || 1);

	function xOf(value: number): number {
		return PL + ((value - domainMin) / span) * plotW;
	}

	const baseX = $derived(xOf(base));
</script>

<figure class="chart">
	{#if title}<figcaption>{title}</figcaption>{/if}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={title}>
		<!-- ベースライン（他の変数を平均値に固定した時の予測値） -->
		<line x1={baseX} y1={PT - 2} x2={baseX} y2={PT + bars.length * ROW_H} stroke="var(--color-text-muted)" stroke-width="1" stroke-dasharray="3 3" />

		{#each bars as b, i}
			{@const y = PT + i * ROW_H + ROW_H * 0.2}
			{@const barH = ROW_H * 0.6}
			{@const x1 = xOf(b.low)}
			{@const x2 = xOf(b.high)}
			<text x={PL - 10} y={y + barH / 2 + 4} text-anchor="end" fill="var(--color-text)" font-size="8">{b.label}</text>
			<rect x={Math.min(x1, x2)} y={y} width={Math.max(Math.abs(x2 - x1), 1)} height={barH} fill="var(--chart-1)" opacity="0.85" rx="3" />
			<text x={Math.max(x1, x2) + 8} y={y + barH / 2 + 4} fill="var(--color-text-muted)" font-size="8">{fmt(b.low)} 〜 {fmt(b.high)}</text>
		{/each}
	</svg>
</figure>

<style lang="scss">
	.chart { display: flex; flex-direction: column; gap: 6px; margin: 0; }
	figcaption { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); }
	svg { width: 100%; height: auto; }
</style>
