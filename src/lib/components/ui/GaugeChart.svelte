<script lang="ts">
	import type { ValidityLevel } from '$lib/analysis/validity';

	type Props = {
		/** 現在値 */
		value: number;
		/** 目標値 */
		target: number;
		title?: string;
		/** ガウジの幅（px）。高さは内部で比率を保って決まる */
		size?: number;
		/** 現在値・目標値の数値キャプションを表示するか */
		showValues?: boolean;
	};

	let { value, target, title, size = 160, showValues = true }: Props = $props();

	const STATUS_LABEL: Record<ValidityLevel, string> = { good: '達成', caution: '順調', poor: '遅れ' };

	// 達成率のしきい値は ValidityCard 等と同じ good/caution/poor の3段階に揃える
	const rate = $derived(target !== 0 ? value / target : 0);
	const level = $derived<ValidityLevel>(rate >= 1 ? 'good' : rate >= 0.7 ? 'caution' : 'poor');
	const fillPct = $derived(Math.max(0, Math.min(1, rate)) * 100);

	const cx = 100;
	const cy = 104;
	const r = 82;
	const strokeWidth = 18;
	const pathD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	const ariaLabel = $derived(
		`${title ? title + ': ' : ''}現在値${fmt(value)}／目標値${fmt(target)}、達成率${Math.round(rate * 100)}%（${STATUS_LABEL[level]}）`
	);
</script>

<figure class="gauge level-{level}" style:width="{size}px">
	{#if title}<figcaption class="gauge-title">{title}</figcaption>{/if}
	<svg viewBox="0 0 200 116" role="img" aria-label={ariaLabel}>
		<path class="track" d={pathD} pathLength="100" style:stroke-width={strokeWidth} />
		<path class="fill" d={pathD} pathLength="100" stroke-dasharray="{fillPct} 100" style:stroke-width={strokeWidth} />
	</svg>
	<div class="gauge-readout">
		<span class="gauge-pct">{Math.round(rate * 100)}%</span>
		<span class="gauge-status">{STATUS_LABEL[level]}</span>
		{#if showValues}
			<span class="gauge-values">現在 {fmt(value)} ／ 目標 {fmt(target)}</span>
		{/if}
	</div>
</figure>

<style lang="scss">
	.gauge {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.gauge-title {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: 4px;
		text-align: center;
	}

	svg {
		width: 100%;
		display: block;
	}

	.track {
		fill: none;
		stroke: var(--color-neutral-bg);
		stroke-linecap: round;
	}

	.fill {
		fill: none;
		stroke-linecap: round;
		transition: stroke-dasharray 0.3s ease;
	}

	.level-good .fill { stroke: var(--color-success); }
	.level-caution .fill { stroke: var(--color-warning); }
	.level-poor .fill { stroke: var(--color-error); }

	.gauge-readout {
		margin-top: -28%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.gauge-pct {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.gauge-status {
		font-size: 0.75rem;
		font-weight: 600;

		.level-good & { color: var(--color-success); }
		.level-caution & { color: var(--color-warning); }
		.level-poor & { color: var(--color-error); }
	}

	.gauge-values {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}
</style>
