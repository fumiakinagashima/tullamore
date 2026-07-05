<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Simulator from '$lib/components/chat/Simulator.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let note = $state('');
	let loading = $state(false);
	let error = $state('');
	let model = $state<LinearRegressionModel | null>(null);
	let validity = $state<ValidityAssessment | null>(null);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));

	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	const simulatorProps = $derived.by(() => {
		const m = model;
		if (!m) return null;
		return {
			simulatorId: 'ad-hoc',
			name: '回帰分析結果',
			description: note || undefined,
			targetLabel: labelOf(m.targetColumn),
			intercept: m.intercept,
			features: m.featureColumns.map((key, i) => ({
				key,
				label: labelOf(key),
				coefficient: m.coefficients[i],
				min: m.featureRanges[key].min,
				max: m.featureRanges[key].max,
				mean: m.featureRanges[key].mean
			})),
			metrics: m.metrics
		};
	});

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		model = null;
		validity = null;
		error = '';
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);

	// 右側のAIアシスタントに現在の設定・結果を渡す（妥当性について聞かれた時の材料にもなる）
	$effect(() => {
		bridge.analysisType = 'regression';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		const m = model;
		bridge.resultSummary = m
			? {
					target_column: m.targetColumn,
					feature_columns: m.featureColumns,
					r2: m.metrics.r2,
					adjusted_r2: m.metrics.adjustedR2,
					sample_size: m.metrics.sampleSize,
					coefficients: Object.fromEntries(m.featureColumns.map((c, i) => [c, m.coefficients[i]])),
					validity: validity ? { overall: validity.overallLevel, comment: validity.overallComment } : undefined
				}
			: null;
	});

	// AIアシスタントの set_config ツールから呼ばれる。dataSourceId を変えると
	// 下の $effect が targetColumn/featureColumns をリセットしてしまうため、
	// リセットが先に走るのを tick() で待ってから値をセットする
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
			const body = (await res.json()) as { model?: LinearRegressionModel; validity?: ValidityAssessment; error?: string };
			if (!res.ok) throw new Error(body.error ?? '分析に失敗しました');
			model = body.model ?? null;
			validity = body.validity ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">回帰分析</h1>
		<p class="page-sub">説明変数を動かすと目的変数がどう変化するかをシミュレーションします</p>
	</div>

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

		<Textbox label="分析メモ（任意）" bind:value={note} placeholder="例: 広告費と来店数が売上に与える影響を見たい" />

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? '分析中…' : '分析を実行'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if simulatorProps}
			<Simulator {...simulatorProps} />
			{#if validity}
				<div class="validity-row">
					<ValidityCard {validity} />
				</div>
			{/if}
		{:else}
			<div class="empty-results">
				<p>上の設定欄でデータソース・目的変数・説明変数を選び、「分析を実行」を押してください</p>
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

	/* Simulator has an internal max-width; override it here to fill the page */
	.results-panel {
		margin: 24px 0;

		:global(.simulator) {
			max-width: none;
		}
	}

	.validity-row {
		margin-top: 16px;
	}

	.empty-results {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 160px;
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
		gap: 24px;
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
