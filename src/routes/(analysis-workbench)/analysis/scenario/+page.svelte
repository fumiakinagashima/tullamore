<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { predict } from '$lib/analysis/registry';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import BarChart from '$lib/components/ui/BarChart.svelte';
	import DataGrid from '$lib/components/ui/DataGrid.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	type GridRow = Record<string, string | number | null>;

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let model = $state<LinearRegressionModel | null>(null);
	let validity = $state<ValidityAssessment | null>(null);
	let rows = $state<GridRow[]>([]);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	const gridColumns = $derived([
		{ key: 'name', label: 'シナリオ名', type: 'text' as const },
		...(model?.featureColumns ?? []).map((key) => ({ key, label: labelOf(key), type: 'number' as const }))
	]);

	// シナリオ行の値からpredict()で即時計算する（サーバー往復なし。Simulatorのスライダーと同じ考え方）
	const scenarios = $derived.by(() => {
		const m = model;
		if (!m) return [];
		return rows.map((r, i) => {
			const vals = Object.fromEntries(m.featureColumns.map((k) => [k, Number(r[k]) || 0]));
			let value: number | null = null;
			try {
				value = predict(m, vals);
			} catch {
				value = null;
			}
			return { name: String(r.name || `シナリオ${i + 1}`), value };
		});
	});

	const chartData = $derived(
		scenarios.filter((s): s is { name: string; value: number } => s.value !== null).map((s) => ({ label: s.name, value: s.value }))
	);

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		model = null;
		validity = null;
		rows = [];
		error = '';
	});

	// モデルを学習し直したらシナリオ行をベースケース（平均値）1行にリセットする。
	// 平均値はSQL集計由来で長い小数になりがちなので、グリッドの初期表示用に丸める
	$effect(() => {
		const m = model;
		rows = m
			? [{ name: 'ベースケース', ...Object.fromEntries(m.featureColumns.map((k) => [k, Math.round(m.featureRanges[k].mean * 100) / 100])) }]
			: [];
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	// 目的変数を切り替えた時、それまで説明変数として選んでいた列が新しい目的変数と重複していたら除外する
	// （featureCandidates からは自動的に消えるが、チェック状態自体は featureColumns に残ってしまうため）
	$effect(() => {
		if (featureColumns.includes(targetColumn)) {
			featureColumns = featureColumns.filter((k) => k !== targetColumn);
		}
	});

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);

	$effect(() => {
		bridge.analysisType = 'scenario';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		bridge.resultSummary =
			model && scenarios.length > 0
				? {
						target_column: targetColumn,
						scenarios: scenarios.map((s) => ({ name: s.name, predicted_value: s.value })),
						validity: validity ? { overall: validity.overallLevel, comment: validity.overallComment } : undefined
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
		<h1 class="page-title">シナリオ比較</h1>
		<p class="page-sub">説明変数の組み合わせを複数パターン用意し、目的変数の予測値を横並びで比較します</p>
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

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? '分析中…' : '分析を実行'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if model && chartData.length > 0}
			<BarChart data={chartData} title="シナリオ別の{labelOf(targetColumn)}予測値" />
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

	{#if model}
		<section class="grid-panel">
			<p class="config-title">シナリオ（値を編集すると即グラフに反映されます）</p>
			<DataGrid columns={gridColumns} bind:rows />
		</section>
	{/if}
</div>

<style lang="scss">
	.module-page {
		padding: 24px 32px 40px;
	}

	.page-header { margin-bottom: 20px; }
	.page-title { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0 0 4px; }
	.page-sub { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }

	.results-panel {
		margin: 24px 0;
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

	.grid-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 24px;
	}

	.validity-row {
		margin-top: 16px;
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
