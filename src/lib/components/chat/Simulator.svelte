<script lang="ts">
	import type { SimulatorContent } from '$lib/types/chat';

	type Props = Omit<SimulatorContent, 'type'>;

	let { name, description, targetLabel, intercept, features, metrics }: Props = $props();

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });

	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	function coefficientLabel(coefficient: number): string {
		return `${coefficient >= 0 ? '+' : '−'} ${fmt(Math.abs(coefficient))}`;
	}
</script>

<div class="simulator">
	<p class="simulator-title">{name}</p>
	{#if description}<p class="simulator-desc">{description}</p>{/if}

	<div class="equation">
		<span class="target">{targetLabel}</span>
		<span class="eq">=</span>
		<span class="term intercept">{fmt(intercept)}</span>
		{#each features as f}
			<span class="term" class:negative={f.coefficient < 0}>{coefficientLabel(f.coefficient)} × {f.label}</span>
		{/each}
	</div>

	<div class="features">
		{#each features as f}
			<div class="feature-row">
				<span class="feature-label">{f.label}</span>
				<span class="feature-range">実測範囲 {fmt(f.min)} 〜 {fmt(f.max)}（平均 {fmt(f.mean)}）</span>
			</div>
		{/each}
	</div>

	<div class="metrics">
		<span class="metric"><span class="metric-label">決定係数 R²</span><span class="metric-value">{fmt(metrics.r2)}</span></span>
		<span class="metric"><span class="metric-label">自由度調整済みR²</span><span class="metric-value">{fmt(metrics.adjustedR2)}</span></span>
		<span class="metric"><span class="metric-label">サンプル数</span><span class="metric-value">{metrics.sampleSize}件</span></span>
	</div>
</div>

<style lang="scss">
	.simulator {
		padding: 16px 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		min-width: 280px;
		max-width: 560px;
	}

	.simulator-title { font-weight: 600; font-size: 0.9375rem; color: var(--color-text); margin: 0 0 2px; }
	.simulator-desc { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0 0 12px; }

	.equation {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
		padding: 10px 12px;
		background: var(--color-background);
		border-radius: 8px;
		font-size: 0.875rem;
		margin-bottom: 12px;

		.target { font-weight: 600; color: var(--color-text); }
		.eq { color: var(--color-text-muted); }
		.term { color: var(--color-text); }
		.term.intercept { color: var(--color-text-muted); }
		.term.negative { color: var(--color-error); }
	}

	.features {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
	}

	.feature-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		font-size: 0.8125rem;
	}

	.feature-label { color: var(--color-text); font-weight: 500; flex-shrink: 0; }
	.feature-range { color: var(--color-text-muted); text-align: right; }

	.metrics {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		padding-top: 10px;
		border-top: 1px solid var(--color-border);
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.metric-label { font-size: 0.6875rem; color: var(--color-text-muted); }
	.metric-value { font-size: 0.875rem; font-weight: 600; color: var(--color-text); }
</style>
