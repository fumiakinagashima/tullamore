<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { DescriptiveStatsSummary } from '$lib/analysis/descriptive-stats';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import BarChart from '$lib/components/ui/BarChart.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let selectedColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let result = $state<Record<string, DescriptiveStatsSummary> | null>(null);

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
		error = '';
	});

	function toggleColumn(key: string, checked: boolean) {
		selectedColumns = checked ? [...selectedColumns, key] : selectedColumns.filter((k) => k !== key);
	}

	const canRun = $derived(!!dataSourceId && selectedColumns.length > 0);

	$effect(() => {
		bridge.analysisType = 'descriptive-stats';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			feature_columns: selectedColumns.length > 0 ? selectedColumns : undefined
		};
		bridge.resultSummary = result
			? Object.fromEntries(
					Object.entries(result).map(([key, s]) => [
						labelOf(key),
						{
							n: s.n,
							mean: s.mean,
							stddev: s.stddev,
							min: s.min,
							max: s.max,
							median: s.median,
							q1: s.q1,
							q3: s.q3,
							outlier_count: s.outlierCount,
							validity: { overall: s.validity.overallLevel, comment: s.validity.overallComment }
						}
					])
				)
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
			const res = await fetch('/api/analysis/descriptive-stats', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, columns: selectedColumns })
			});
			const body = (await res.json()) as { stats?: Record<string, DescriptiveStatsSummary>; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'Analysis failed');
			result = body.stats ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	function histogramBars(s: DescriptiveStatsSummary) {
		return s.histogram.map((b) => ({ label: `${fmt(b.binStart)} - ${fmt(b.binEnd)}`, value: b.count }));
	}
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">Descriptive Statistics</h1>
		<p class="page-sub">Displays basic statistics (mean, median, standard deviation, quartiles) and a histogram for the selected columns</p>
	</div>

	<section class="config-panel">
		<p class="config-title">Settings</p>
		<div class="config-row">
			<Select label="Data Source" bind:value={dataSourceId} options={sourceOptions} />
		</div>

		<div class="feature-picker">
			<span class="field-label">Columns to view statistics for (multiple selection allowed)</span>
			{#if !dataSourceId}
				<p class="hint">Please select a data source first</p>
			{:else if numericColumns.length === 0}
				<p class="hint">No numeric columns available to select</p>
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
				{loading ? 'Calculating...' : 'Calculate Statistics'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if result}
			<div class="stats-grid">
				{#each Object.entries(result) as [key, s] (key)}
					<div class="stats-card">
						<p class="stats-card-title">{labelOf(key)}</p>
						<div class="metrics-row">
							<div class="metric"><span class="metric-label">Count</span><span class="metric-value">{s.n.toLocaleString()}</span></div>
							<div class="metric"><span class="metric-label">Mean</span><span class="metric-value highlight">{fmt(s.mean)}</span></div>
							<div class="metric"><span class="metric-label">Median</span><span class="metric-value">{fmt(s.median)}</span></div>
							<div class="metric"><span class="metric-label">Std Dev</span><span class="metric-value">{fmt(s.stddev)}</span></div>
							<div class="metric"><span class="metric-label">Min</span><span class="metric-value">{fmt(s.min)}</span></div>
							<div class="metric"><span class="metric-label">Max</span><span class="metric-value">{fmt(s.max)}</span></div>
							<div class="metric"><span class="metric-label">Q1</span><span class="metric-value">{fmt(s.q1)}</span></div>
							<div class="metric"><span class="metric-label">Q3</span><span class="metric-value">{fmt(s.q3)}</span></div>
							<div class="metric"><span class="metric-label">IQR</span><span class="metric-value">{fmt(s.iqr)}</span></div>
							<div class="metric"><span class="metric-label">Outlier Candidates</span><span class="metric-value">{s.outlierCount}</span></div>
						</div>
						<BarChart data={histogramBars(s)} title="Distribution" />
						<ValidityCard validity={s.validity} />
					</div>
				{/each}
			</div>
		{:else}
			<div class="empty-results">
				<p>Select a data source and columns to view statistics for in the settings panel above, then click "Calculate Statistics"</p>
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

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 16px;
	}

	.stats-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.stats-card-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.metrics-row {
		display: flex;
		flex-wrap: wrap;
		gap: 14px 20px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.metric-label { font-size: 0.6875rem; color: var(--color-text-muted); }
	.metric-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);

		&.highlight { color: var(--color-primary); font-size: 1rem; }
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
