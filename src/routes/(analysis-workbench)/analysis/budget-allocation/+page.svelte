<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import { continuousColumns } from '$lib/analysis/column-type';
	import {
		optimizeBudgetAllocation,
		defaultChannelBounds,
		type ChannelBounds,
		type BudgetAllocationResult
	} from '$lib/analysis/budget-allocation';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import { BUDGET_ALLOCATION_COEF_EPSILON } from '$lib/constants';
	import BarChart from '$lib/components/ui/BarChart.svelte';
	import Table from '$lib/components/ui/Table.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import NumberInput from '$lib/components/ui/NumberInput.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let model = $state<LinearRegressionModel | null>(null);
	let validity = $state<ValidityAssessment | null>(null);

	let boundsRows = $state<Record<string, ChannelBounds>>({});
	let totalBudget = $state(0);
	let result = $state<BudgetAllocationResult | null>(null);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		model = null;
		validity = null;
		result = null;
		error = '';
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);

	// 右側のAIアシスタントに現在の設定・結果を渡す（チャネルごとの上下限は画面側でのみ調整する）
	$effect(() => {
		bridge.analysisType = 'budget-allocation';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined,
			total_budget: totalBudget || undefined
		};
		bridge.resultSummary = result
			? {
					target_column: targetColumn,
					total_budget: result.totalBudget,
					predicted_current: result.predictedCurrent,
					predicted_optimal: result.predictedOptimal,
					uplift: result.uplift,
					infeasible: result.infeasible,
					allocation: Object.fromEntries(result.channels.map((c) => [c.key, c.allocated])),
					validity: validity ? { overall: validity.overallLevel, comment: validity.overallComment } : undefined
				}
			: null;
	});

	// AIアシスタントの set_config ツールから呼ばれる。回帰分析ページと同じパターン
	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (typeof patch.target_column === 'string') targetColumn = patch.target_column;
		if (Array.isArray(patch.feature_columns)) {
			featureColumns = patch.feature_columns.filter((c): c is string => typeof c === 'string');
		}
		if (typeof patch.total_budget === 'number') totalBudget = patch.total_budget;
		await tick();
		if (canRun) await fitModel();
	}

	$effect(() => {
		bridge.applyConfig = applyConfig;
		return () => {
			if (bridge.applyConfig === applyConfig) bridge.applyConfig = null;
		};
	});

	async function fitModel() {
		if (!canRun) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/analysis/regression', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, targetColumn, featureColumns })
			});
			const body = (await res.json()) as { model?: LinearRegressionModel; validity?: ValidityAssessment; error?: string };
			if (!res.ok) throw new Error(body.error ?? '分析に失敗しました');
			model = body.model ?? null;
			validity = body.validity ?? null;
			result = null;
			if (model) {
				boundsRows = Object.fromEntries(model.featureColumns.map((k) => [k, defaultChannelBounds(model!, k)]));
				totalBudget = model.featureColumns.reduce((sum, k) => sum + model!.featureRanges[k].mean, 0);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function runOptimization() {
		if (!model) return;
		result = optimizeBudgetAllocation(model, model.featureColumns, totalBudget, boundsRows, BUDGET_ALLOCATION_COEF_EPSILON);
	}

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	const allocationChartSeries = $derived(
		result
			? [
					{ name: '現在（平均）', data: result.channels.map((c) => ({ label: labelOf(c.key), value: c.current })) },
					{ name: '最適配分', data: result.channels.map((c) => ({ label: labelOf(c.key), value: c.allocated })) }
				]
			: []
	);

	const tableColumns = [
		{ key: 'channel', label: 'チャネル' },
		{ key: 'coefficient', label: '限界効果（係数）' },
		{ key: 'current', label: '現在（平均）' },
		{ key: 'allocated', label: '最適配分' },
		{ key: 'delta', label: '増減' }
	];

	const tableRows = $derived(
		result
			? result.channels.map((c) => ({
					channel: labelOf(c.key) + (c.isNegligible ? '（効果ほぼなし）' : ''),
					coefficient: fmt(c.coefficient),
					current: fmt(c.current),
					allocated: fmt(c.allocated),
					delta: (c.allocated - c.current >= 0 ? '+' : '') + fmt(c.allocated - c.current)
				}))
			: []
	);
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">予算配分最適化</h1>
		<p class="page-sub">
			説明変数を予算配分するチャネル（広告費等）とみなし、予算総額を目的変数が最大になるよう各チャネルへ配分します
		</p>
	</div>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="目的変数" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="feature-picker">
			<span class="field-label">配分するチャネル（説明変数、複数選択可）</span>
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
			<button class="run-btn" onclick={fitModel} disabled={!canRun || loading}>
				{loading ? 'モデル作成中…' : 'モデルを作成'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>

		{#if model}
			<div class="bounds-section">
				<p class="config-title">チャネルごとの上下限（既定は実測レンジ）</p>
				<div class="bounds-rows">
					{#each model.featureColumns as key (key)}
						<div class="bounds-row">
							<span class="bounds-label">{labelOf(key)}</span>
							<NumberInput label="下限" bind:value={boundsRows[key].min} min={0} />
							<NumberInput label="上限" bind:value={boundsRows[key].max} min={0} />
						</div>
					{/each}
				</div>
			</div>

			<div class="config-row">
				<NumberInput label="予算総額" bind:value={totalBudget} min={0} />
			</div>

			<div class="run-row">
				<button class="run-btn" onclick={runOptimization}>配分を最適化</button>
			</div>
		{/if}
	</section>

	<section class="results-panel">
		{#if result}
			<div class="results-card">
				{#if result.infeasible}
					<p class="warning-text">
						指定した予算総額はチャネルの上下限の合計に収まらないため、配分は目安値です。上下限を見直してください。
					</p>
				{/if}
				<div class="metrics-row">
					<div class="metric">
						<span class="metric-label">予算総額</span>
						<span class="metric-value">{fmt(result.totalBudget)}</span>
					</div>
					<div class="metric">
						<span class="metric-label">現在配分での予測値</span>
						<span class="metric-value">{fmt(result.predictedCurrent)}</span>
					</div>
					<div class="metric">
						<span class="metric-label">最適配分での予測値</span>
						<span class="metric-value highlight">{fmt(result.predictedOptimal)}</span>
					</div>
					<div class="metric">
						<span class="metric-label">増加分</span>
						<span class="metric-value highlight">{result.uplift >= 0 ? '+' : ''}{fmt(result.uplift)}</span>
					</div>
				</div>

				<BarChart series={allocationChartSeries} mode="grouped" title="チャネルごとの配分比較" />

				<Table columns={tableColumns} rows={tableRows} />

				{#if validity}
					<ValidityCard {validity} />
				{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>上の設定欄でデータソース・目的変数・チャネルを選んでモデルを作成し、予算総額と上下限を設定してから「配分を最適化」を押してください</p>
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.module-page {
		padding: 24px 32px 40px;
	}

	.page-header { margin-bottom: 20px; }
	.page-title { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0 0 4px; }
	.page-sub { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }

	.results-panel { margin: 24px 0; }

	.empty-results {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 220px;
		padding: 24px;
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: 10px;
		text-align: center;

		p {
			font-size: 0.8125rem;
			color: var(--color-text-muted);
			margin: 0;
		}
	}

	.results-card {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.warning-text {
		font-size: 0.8125rem;
		color: var(--color-warning);
		background: var(--color-warning-bg);
		border-radius: 6px;
		padding: 8px 12px;
		margin: 0;
	}

	.metrics-row {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.metric-label { font-size: 0.6875rem; color: var(--color-text-muted); }
	.metric-value {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);

		&.highlight { color: var(--color-primary); font-size: 1.125rem; }
	}

	.bounds-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px solid var(--color-border);
	}

	.bounds-rows {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.bounds-row {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}

	.bounds-label {
		font-size: 0.8125rem;
		color: var(--color-text);
		min-width: 120px;
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
		grid-template-columns: repeat(auto-fit, minmax(220px, 320px));
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
