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
		{ key: 'name', label: 'Scenario Name', type: 'text' as const },
		...(model?.featureColumns ?? []).map((key) => ({ key, label: labelOf(key), type: 'number' as const }))
	]);

	// Compute instantly from the scenario row values with predict() (no server round trip — same approach as the Simulator sliders)
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
			return { name: String(r.name || `Scenario ${i + 1}`), value };
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

	// After retraining the model, reset the scenario rows to a single base case (average values) row.
	// Averages come from SQL aggregation and tend to be long decimals, so round them for the grid's initial display
	$effect(() => {
		const m = model;
		rows = m
			? [{ name: 'Base Case', ...Object.fromEntries(m.featureColumns.map((k) => [k, Math.round(m.featureRanges[k].mean * 100) / 100])) }]
			: [];
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	// When the outcome variable is switched, exclude any column that was previously selected as an explanatory
	// variable if it now duplicates the new outcome variable (it disappears from featureCandidates automatically,
	// but its checked state would otherwise remain stuck in featureColumns)
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
			if (!res.ok) throw new Error(body.error ?? 'Analysis failed');
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
		<h1 class="page-title">Scenario Comparison</h1>
		<p class="page-sub">Prepare multiple combinations of explanatory variables and compare the predicted outcome values side by side</p>
	</div>

	<section class="config-panel">
		<p class="config-title">Settings</p>
		<div class="config-row">
			<Select label="Data Source" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="Outcome Variable" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="feature-picker">
			<span class="field-label">Explanatory Variables (multiple selection allowed)</span>
			{#if !targetColumn}
				<p class="hint">Please select an outcome variable first</p>
			{:else if featureCandidates.length === 0}
				<p class="hint">There are no numeric columns available to select</p>
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
				{loading ? 'Analyzing…' : 'Run Analysis'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if model && chartData.length > 0}
			<BarChart data={chartData} title="Predicted {labelOf(targetColumn)} by Scenario" />
			{#if validity}
				<div class="validity-row">
					<ValidityCard {validity} />
				</div>
			{/if}
		{:else}
			<div class="empty-results">
				<p>Select a data source, outcome variable, and explanatory variables in the settings above, then click "Run Analysis"</p>
			</div>
		{/if}
	</section>

	{#if model}
		<section class="grid-panel">
			<p class="config-title">Scenarios (editing a value updates the chart instantly)</p>
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
