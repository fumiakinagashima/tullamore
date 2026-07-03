<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { solveForFeature } from '$lib/analysis/goal-seek';
	import { predict } from '$lib/analysis/registry';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let model = $state<LinearRegressionModel | null>(null);

	let solveFeature = $state('');
	let targetValueText = $state('');
	let fixedValues = $state<Record<string, number>>({});

	const targetValue = $derived(targetValueText === '' ? null : Number(targetValueText));

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	const solveFeatureOptions = $derived((model?.featureColumns ?? []).map((k) => ({ value: k, label: labelOf(k) })));
	const otherFeatures = $derived((model?.featureColumns ?? []).filter((k) => k !== solveFeature));

	const result = $derived.by(() => {
		const m = model;
		if (!m || !solveFeature || targetValue === null) return null;
		return solveForFeature(m, targetValue, solveFeature, fixedValues);
	});

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		model = null;
		error = '';
	});

	// モデルを学習し直したら、逆算対象・固定値をリセットする
	$effect(() => {
		const m = model;
		if (!m) {
			solveFeature = '';
			fixedValues = {};
			targetValueText = '';
			return;
		}
		solveFeature = m.featureColumns[0] ?? '';
		fixedValues = Object.fromEntries(m.featureColumns.map((k) => [k, m.featureRanges[k].mean]));
		// 目標値の初期値は「全説明変数が平均値の時の予測値」（＝現状維持のベースライン）にしておく
		const means = Object.fromEntries(m.featureColumns.map((k) => [k, m.featureRanges[k].mean]));
		try {
			targetValueText = String(Math.round(predict(m, means)));
		} catch {
			targetValueText = '';
		}
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);

	$effect(() => {
		bridge.analysisType = 'goal-seek';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		const r = result;
		bridge.resultSummary =
			model && r
				? {
						target_column: targetColumn,
						target_value: targetValue,
						solved_feature: solveFeature,
						solved_value: r.value,
						is_out_of_range: r.isOutOfRange
					}
				: null;
	});

	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (typeof patch.target_column === 'string') targetColumn = patch.target_column;
		if (Array.isArray(patch.feature_columns)) {
			featureColumns = patch.feature_columns.filter((c): c is string => typeof c === 'string');
		}
		await tick();
		if (canRun) await run();
	}

	$effect(() => {
		bridge.applyConfig = applyConfig;
		return () => {
			if (bridge.applyConfig === applyConfig) bridge.applyConfig = null;
		};
	});

	async function run() {
		if (!canRun) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/analysis/regression', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, targetColumn, featureColumns })
			});
			const body = (await res.json()) as { model?: LinearRegressionModel; error?: string };
			if (!res.ok) throw new Error(body.error ?? '分析に失敗しました');
			model = body.model ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">ゴールシーク</h1>
		<p class="page-sub">目的変数を目標値にするために、説明変数がいくつであるべきかを逆算します</p>
	</div>

	<section class="results-panel">
		{#if model}
			<div class="goal-form">
				<div class="goal-row">
					<Select label="逆算する変数" bind:value={solveFeature} options={solveFeatureOptions} />
					<Textbox label="{labelOf(targetColumn)}の目標値" type="number" bind:value={targetValueText} />
				</div>

				{#if otherFeatures.length > 0}
					<div class="fixed-values">
						<span class="field-label">他の説明変数（固定する値）</span>
						{#each otherFeatures as key (key)}
							{@const range = model.featureRanges[key]}
							<div class="fixed-row">
								<div class="fixed-head">
									<span>{labelOf(key)}</span>
									<span class="fixed-value">{fmt(fixedValues[key] ?? range.mean)}</span>
								</div>
								<input
									type="range"
									min={range.min}
									max={range.max}
									step={(range.max - range.min) / 100 || 1}
									value={fixedValues[key] ?? range.mean}
									oninput={(e) => (fixedValues = { ...fixedValues, [key]: Number(e.currentTarget.value) })}
								/>
							</div>
						{/each}
					</div>
				{/if}

				{#if result}
					<div class="result-card">
						<span class="result-label">{labelOf(solveFeature)}の必要値</span>
						<span class="result-value">{fmt(result.value)}</span>
						{#if result.isOutOfRange}
							<p class="warn-text">実測データの範囲外です（外挿）。この結果の信頼性は低くなります</p>
						{/if}
					</div>
				{:else if solveFeature && targetValue !== null}
					<p class="hint">
						「{labelOf(solveFeature)}」は{labelOf(targetColumn)}にほぼ影響しないため逆算できません。別の変数を選んでください
					</p>
				{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>下の設定欄でデータソース・目的変数・説明変数を選び、「分析を実行」を押してください</p>
			</div>
		{/if}
	</section>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="目的変数" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="feature-picker">
			<span class="field-label">説明変数（複数選択可）</span>
			{#if !targetColumn}
				<p class="hint">先に目的変数を選択してください</p>
			{:else if featureCandidates.length === 0}
				<p class="hint">選択できる数値列がありません</p>
			{:else}
				<div class="checkbox-list">
					{#each featureCandidates as col (col.key)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={featureColumns.includes(col.key)}
								onchange={(e) => toggleFeature(col.key, e.currentTarget.checked)}
							/>
							{col.label}
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? '分析中…' : '分析を実行'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>
</div>

<style lang="scss">
	.module-page {
		padding: 24px 32px 40px;
	}

	.page-header { margin-bottom: 20px; }
	.page-title { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0 0 4px; }
	.page-sub { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }

	.results-panel {
		margin-bottom: 24px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.empty-results {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 160px;
		padding: 24px;
		text-align: center;

		p {
			font-size: 0.8125rem;
			color: var(--color-text-muted);
			margin: 0;
		}
	}

	.goal-form {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.goal-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 320px));
		gap: 12px;
	}

	.fixed-values {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.fixed-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.fixed-head {
		display: flex;
		justify-content: space-between;
		font-size: 0.8125rem;
		color: var(--color-text);
	}

	.fixed-value { font-weight: 600; }

	input[type='range'] {
		width: 100%;
		accent-color: var(--color-primary);
	}

	.result-card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px;
		background: var(--color-background);
		border: 1px solid var(--color-primary);
		border-radius: 8px;
	}

	.result-label { font-size: 0.75rem; color: var(--color-text-muted); }
	.result-value { font-size: 1.5rem; font-weight: 700; color: var(--color-primary); }

	.warn-text {
		font-size: 0.75rem;
		color: var(--color-warning);
		margin: 4px 0 0;
	}

	.config-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.config-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		margin: 0;
	}

	.config-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 360px));
		gap: 12px;
	}

	.feature-picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.checkbox-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8125rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.run-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.run-btn {
		padding: 8px 18px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s;

		&:hover { opacity: 0.85; }
		&:disabled { opacity: 0.5; cursor: not-allowed; }
	}

	.error-text {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0;
	}
</style>
