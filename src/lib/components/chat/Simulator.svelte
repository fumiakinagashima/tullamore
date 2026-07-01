<script lang="ts">
	import { untrack } from 'svelte';
	import type { SimulatorContent } from '$lib/types/chat';
	import { predict } from '$lib/analysis/registry';
	import type { LinearRegressionModel } from '$lib/analysis/types';

	type Props = Omit<SimulatorContent, 'type'>;

	let { name, description, targetLabel, intercept, features, metrics }: Props = $props();

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });

	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	function coefficientLabel(coefficient: number): string {
		return `${coefficient >= 0 ? '+' : '−'} ${fmt(Math.abs(coefficient))}`;
	}

	// features は create_simulator/get_simulator の結果からAIが構築するprops。
	// クライアントサイドの即時再計算にはサーバーと同じ predict() 純関数を使う（サーバーラウンドトリップなし）。
	const model = $derived<LinearRegressionModel>({
		method: 'linear_regression',
		targetColumn: '',
		featureColumns: features.map((f) => f.key),
		intercept,
		coefficients: features.map((f) => f.coefficient),
		metrics,
		featureRanges: Object.fromEntries(features.map((f) => [f.key, { min: f.min, max: f.max, mean: f.mean }]))
	});

	let values = $state<Record<string, number>>(
		untrack(() => Object.fromEntries(features.map((f) => [f.key, f.mean])))
	);

	const predicted = $derived.by(() => {
		try {
			return predict(model, values);
		} catch {
			return null;
		}
	});

	function isOutOfRange(key: string): boolean {
		const f = features.find((x) => x.key === key);
		if (!f) return false;
		const v = values[key];
		return v < f.min || v > f.max;
	}

	function handleInput(key: string, raw: string) {
		values = { ...values, [key]: Number(raw) };
	}

	function resetToMean() {
		values = Object.fromEntries(features.map((f) => [f.key, f.mean]));
	}
</script>

<div class="simulator">
	<div class="simulator-header">
		<div>
			<p class="simulator-title">{name}</p>
			{#if description}<p class="simulator-desc">{description}</p>{/if}
		</div>
		<button type="button" class="reset-btn" onclick={resetToMean}>平均値に戻す</button>
	</div>

	<div class="predicted-card">
		<span class="predicted-label">{targetLabel}（予測値）</span>
		<span class="predicted-value">{predicted === null ? '—' : fmt(predicted)}</span>
	</div>

	<div class="sliders">
		{#each features as f (f.key)}
			<div class="slider-row">
				<div class="slider-head">
					<span class="feature-label">{f.label}</span>
					<span class="feature-value" class:warn={isOutOfRange(f.key)}>{fmt(values[f.key])}</span>
				</div>
				<input
					type="range"
					min={f.min}
					max={f.max}
					step={(f.max - f.min) / 100 || 1}
					value={values[f.key]}
					oninput={(e) => handleInput(f.key, e.currentTarget.value)}
				/>
				<div class="slider-foot">
					<span>{fmt(f.min)}</span>
					<span>{fmt(f.max)}</span>
				</div>
				{#if isOutOfRange(f.key)}
					<p class="warn-text">実測データの範囲外です（外挿）。予測の信頼性は低くなります</p>
				{/if}
			</div>
		{/each}
	</div>

	<div class="equation">
		<span class="target">{targetLabel}</span>
		<span class="eq">=</span>
		<span class="term intercept">{fmt(intercept)}</span>
		{#each features as f (f.key)}
			<span class="term" class:negative={f.coefficient < 0}>{coefficientLabel(f.coefficient)} × {f.label}</span>
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
		min-width: 300px;
		max-width: 560px;
	}

	.simulator-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 12px;
	}

	.simulator-title { font-weight: 600; font-size: 0.9375rem; color: var(--color-text); margin: 0 0 2px; }
	.simulator-desc { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }

	.reset-btn {
		flex-shrink: 0;
		padding: 4px 10px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;

		&:hover { color: var(--color-text); border-color: var(--color-text); }
	}

	.predicted-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 16px;
		background: var(--color-background);
		border: 1px solid var(--color-primary);
		border-radius: 8px;
		margin-bottom: 16px;
	}

	.predicted-label { font-size: 0.75rem; color: var(--color-text-muted); }
	.predicted-value { font-size: 1.5rem; font-weight: 700; color: var(--color-primary); }

	.sliders {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-bottom: 14px;
	}

	.slider-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.slider-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.8125rem;
	}

	.feature-label { color: var(--color-text); font-weight: 500; }
	.feature-value { color: var(--color-text); font-weight: 600; }
	.feature-value.warn { color: var(--color-warning); }

	input[type='range'] {
		width: 100%;
		accent-color: var(--color-primary);
	}

	.slider-foot {
		display: flex;
		justify-content: space-between;
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}

	.warn-text {
		font-size: 0.6875rem;
		color: var(--color-warning);
		margin: 0;
	}

	.equation {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
		padding: 10px 12px;
		background: var(--color-background);
		border-radius: 8px;
		font-size: 0.8125rem;
		margin-bottom: 12px;
		color: var(--color-text-muted);

		.target { font-weight: 600; color: var(--color-text); }
		.eq { color: var(--color-text-muted); }
		.term.intercept { color: var(--color-text-muted); }
		.term.negative { color: var(--color-error); }
	}

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
