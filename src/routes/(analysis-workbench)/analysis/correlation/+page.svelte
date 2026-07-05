<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { CorrelationMatrix } from '$lib/analysis/correlation-matrix';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import CorrelationHeatmap from '$lib/components/ui/CorrelationHeatmap.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let selectedColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let result = $state<CorrelationMatrix | null>(null);
	let validity = $state<ValidityAssessment | null>(null);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	$effect(() => {
		dataSourceId;
		selectedColumns = [];
		result = null;
		validity = null;
		error = '';
	});

	function toggleColumn(key: string, checked: boolean) {
		selectedColumns = checked ? [...selectedColumns, key] : selectedColumns.filter((k) => k !== key);
	}

	const canRun = $derived(!!dataSourceId && selectedColumns.length >= 2);

	// 右側のAIアシスタントに現在の設定・結果を渡す
	$effect(() => {
		bridge.analysisType = 'correlation';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			feature_columns: selectedColumns.length > 0 ? selectedColumns : undefined
		};
		bridge.resultSummary = result
			? {
					columns: result.columns,
					strongest_pair: strongestPair
						? {
								a: labelOf(strongestPair.a),
								b: labelOf(strongestPair.b),
								correlation: strongestPair.value
							}
						: null,
					validity: validity ? { overall: validity.overallLevel, comment: validity.overallComment } : undefined
				}
			: null;
	});

	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (Array.isArray(patch.feature_columns)) {
			selectedColumns = patch.feature_columns.filter((c): c is string => typeof c === 'string');
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
			const res = await fetch('/api/analysis/correlation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, columns: selectedColumns })
			});
			const body = (await res.json()) as { matrix?: CorrelationMatrix; validity?: ValidityAssessment; error?: string };
			if (!res.ok) throw new Error(body.error ?? '分析に失敗しました');
			result = body.matrix ?? null;
			validity = body.validity ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	const heatmapColumns = $derived(result ? result.columns.map((key) => ({ key, label: labelOf(key) })) : []);

	const strongestPair = $derived.by(() => {
		if (!result) return null;
		let best: { a: string; b: string; value: number } | null = null;
		for (let i = 0; i < result.columns.length; i++) {
			for (let j = i + 1; j < result.columns.length; j++) {
				const value = result.matrix[i][j];
				if (!best || Math.abs(value) > Math.abs(best.value)) {
					best = { a: result.columns[i], b: result.columns[j], value };
				}
			}
		}
		return best;
	});
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">相関分析</h1>
		<p class="page-sub">選択した列どうしのピアソン相関係数を計算し、ヒートマップで表示します</p>
	</div>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
		</div>

		<div class="feature-picker">
			<span class="field-label">相関を見る列（2つ以上選択）</span>
			{#if !dataSourceId}
				<p class="hint">先にデータソースを選択してください</p>
			{:else if numericColumns.length === 0}
				<p class="hint">選択できる数値列がありません</p>
			{:else}
				<div class="checkbox-list">
					{#each numericColumns as col (col.key)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={selectedColumns.includes(col.key)}
								onchange={(e) => toggleColumn(col.key, e.currentTarget.checked)}
							/>
							{col.label}
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? '計算中…' : '相関を計算'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if result}
			<div class="results-card">
				{#if strongestPair}
					<p class="highlight-text">
						最も相関が強いのは「{labelOf(strongestPair.a)}」と「{labelOf(strongestPair.b)}」（r = {strongestPair.value.toFixed(2)}）
					</p>
				{/if}
				<CorrelationHeatmap columns={heatmapColumns} matrix={result.matrix} />
				{#if validity}
					<ValidityCard {validity} />
				{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>上の設定欄でデータソースと相関を見たい列（2つ以上）を選び、「相関を計算」を押してください</p>
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

	.results-panel { margin-bottom: 24px; }

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
		gap: 14px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.highlight-text {
		font-size: 0.8125rem;
		color: var(--color-text);
		margin: 0;
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
