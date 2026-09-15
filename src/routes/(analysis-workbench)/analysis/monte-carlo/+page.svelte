<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { runMonteCarlo, type FeatureDistribution, type MonteCarloResult } from '$lib/analysis/monte-carlo';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import {
		MONTE_CARLO_MIN_SAMPLES,
		MONTE_CARLO_MAX_SAMPLES,
		MONTE_CARLO_DEFAULT_SAMPLES,
		MONTE_CARLO_HISTOGRAM_BINS,
		MONTE_CARLO_PERCENTILES
	} from '$lib/constants';
	import BarChart from '$lib/components/ui/BarChart.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import NumberInput from '$lib/components/ui/NumberInput.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	const DIST_KIND_OPTIONS = [
		{ value: 'fixed', label: 'Fixed value' },
		{ value: 'uniform', label: 'Uniform distribution' },
		{ value: 'normal', label: 'Normal distribution' },
		{ value: 'triangular', label: 'Triangular distribution' }
	];

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let model = $state<LinearRegressionModel | null>(null);
	let validity = $state<ValidityAssessment | null>(null);

	// Select treats its value as a bindable string, so kind is kept as a string and narrowed to
	// FeatureDistribution when used (same pattern as granularityValue in trend/+page.svelte)
	type DistRowState = { kind: string; min: number; max: number; mean: number; stddev: number; mode: number };
	let distRows = $state<Record<string, DistRowState>>({});

	const distributions = $derived.by<Record<string, FeatureDistribution>>(() => {
		const out: Record<string, FeatureDistribution> = {};
		for (const [key, row] of Object.entries(distRows)) {
			if (row.kind === 'fixed') out[key] = { kind: 'fixed', value: row.mean };
			else if (row.kind === 'normal') out[key] = { kind: 'normal', mean: row.mean, stddev: row.stddev };
			else if (row.kind === 'triangular') out[key] = { kind: 'triangular', min: row.min, max: row.max, mode: row.mode };
			else out[key] = { kind: 'uniform', min: row.min, max: row.max };
		}
		return out;
	});

	let sampleCount = $state(MONTE_CARLO_DEFAULT_SAMPLES);
	let includeResidualNoise = $state(true);
	// NumberInput's value is $bindable(0) with a fallback, so bind:value={undefined} isn't possible
	// (https://svelte.dev/e/props_invalid_value). The "optional" threshold is toggled on/off with a switch instead
	let thresholdEnabled = $state(false);
	let threshold = $state(0);
	let result = $state<MonteCarloResult | null>(null);

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

	// When the target variable changes, drop any previously-selected explanatory variable that now
	// duplicates the new target (it disappears from featureCandidates automatically, but the checked
	// state itself would otherwise remain in featureColumns)
	$effect(() => {
		if (featureColumns.includes(targetColumn)) {
			featureColumns = featureColumns.filter((k) => k !== targetColumn);
		}
	});

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);

	// Pass the current config/results to the AI assistant on the right (distribution settings and
	// sample count are only adjustable from this page)
	$effect(() => {
		bridge.analysisType = 'monte-carlo';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		bridge.resultSummary = result
			? {
					target_column: targetColumn,
					draws: result.summary.draws,
					mean: result.summary.mean,
					stddev: result.summary.stddev,
					percentiles: Object.fromEntries(result.summary.percentiles.map((p) => [`p${p.p}`, p.value])),
					validity: validity ? { overall: validity.overallLevel, comment: validity.overallComment } : undefined
				}
			: null;
	});

	// Called from the AI assistant's set_config tool. Changing dataSourceId causes the $effect below
	// to reset targetColumn/featureColumns, so we wait for that reset to run first via tick() before
	// setting the values (same pattern as the regression analysis page)
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
			if (!res.ok) throw new Error(body.error ?? 'Analysis failed');
			model = body.model ?? null;
			validity = body.validity ?? null;
			result = null;
			if (model) {
				distRows = Object.fromEntries(
					model.featureColumns.map((k) => {
						const range = model!.featureRanges[k];
						return [
							k,
							{
								kind: 'uniform',
								min: range.min,
								max: range.max,
								mean: range.mean,
								stddev: (range.max - range.min) / 4 || 1,
								mode: range.mean
							}
						];
					})
				);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function runSimulation() {
		if (!model) return;
		result = runMonteCarlo(model, distributions, {
			sampleCount,
			includeResidualNoise,
			threshold: thresholdEnabled ? threshold : undefined,
			percentiles: MONTE_CARLO_PERCENTILES,
			histogramBins: MONTE_CARLO_HISTOGRAM_BINS
		});
	}

	const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	const histogramBars = $derived(
		result
			? result.summary.histogram.map((b) => ({ label: `${fmt(b.binStart)}〜${fmt(b.binEnd)}`, value: b.count }))
			: []
	);
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">Monte Carlo Simulation</h1>
		<p class="page-sub">Give explanatory variables a range (distribution), sample repeatedly, and simulate the spread of possible values for the target variable</p>
	</div>

	<section class="config-panel">
		<p class="config-title">Settings</p>
		<div class="config-row">
			<Select label="Data source" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="Target variable" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="feature-picker">
			<span class="field-label">Explanatory variables (multiple selection allowed)</span>
			{#if !targetColumn}
				<p class="hint">Please select a target variable first</p>
			{:else if featureCandidates.length === 0}
				<p class="hint">No numeric columns available to select</p>
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
				{loading ? 'Building model…' : 'Build model'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>

		{#if model}
			<div class="dist-section">
				<p class="config-title">Explanatory variable distribution settings</p>
				<div class="dist-rows">
					{#each model.featureColumns as key (key)}
						<div class="dist-row">
							<span class="dist-label">{labelOf(key)}</span>
							<Select bind:value={distRows[key].kind} options={DIST_KIND_OPTIONS} />
							{#if distRows[key].kind === 'fixed'}
								<NumberInput label="Value" bind:value={distRows[key].mean} />
							{:else if distRows[key].kind === 'uniform'}
								<NumberInput label="Lower bound" bind:value={distRows[key].min} />
								<NumberInput label="Upper bound" bind:value={distRows[key].max} />
							{:else if distRows[key].kind === 'normal'}
								<NumberInput label="Mean" bind:value={distRows[key].mean} />
								<NumberInput label="Standard deviation" bind:value={distRows[key].stddev} min={0} />
							{:else}
								<NumberInput label="Lower bound" bind:value={distRows[key].min} />
								<NumberInput label="Mode" bind:value={distRows[key].mode} />
								<NumberInput label="Upper bound" bind:value={distRows[key].max} />
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div class="config-row">
				<NumberInput label="Sample count" bind:value={sampleCount} min={MONTE_CARLO_MIN_SAMPLES} max={MONTE_CARLO_MAX_SAMPLES} step={1000} />
			</div>
			<Toggle bind:checked={thresholdEnabled} label="Set a threshold and compute the probability of exceeding it" />
			{#if thresholdEnabled}
				<div class="config-row">
					<NumberInput label="Threshold" bind:value={threshold} />
				</div>
			{/if}
			<Toggle bind:checked={includeResidualNoise} label="Include the model's residual noise" />

			<div class="run-row">
				<button class="run-btn" onclick={runSimulation}>Run simulation</button>
			</div>
		{/if}
	</section>

	<section class="results-panel">
		{#if result}
			<div class="results-card">
				<div class="metrics-row">
					<div class="metric">
						<span class="metric-label">Mean</span>
						<span class="metric-value highlight">{fmt(result.summary.mean)}</span>
					</div>
					<div class="metric">
						<span class="metric-label">Standard deviation</span>
						<span class="metric-value">{fmt(result.summary.stddev)}</span>
					</div>
					{#each result.summary.percentiles as p (p.p)}
						<div class="metric">
							<span class="metric-label">p{p.p}</span>
							<span class="metric-value">{fmt(p.value)}</span>
						</div>
					{/each}
					{#if result.summary.probabilityAboveThreshold !== undefined}
						<div class="metric">
							<span class="metric-label">Probability of exceeding {fmt(threshold)}</span>
							<span class="metric-value highlight">{fmt(result.summary.probabilityAboveThreshold * 100)}%</span>
						</div>
					{/if}
				</div>

				<BarChart
					data={histogramBars}
					title="Distribution of {labelOf(targetColumn)} (N={result.summary.draws.toLocaleString()})"
				/>

				{#if validity}
					<ValidityCard {validity} />
				{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>Select a data source, target variable, and explanatory variables in the settings panel above, build a model, set each variable's distribution, then click "Run simulation"</p>
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

	.dist-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px solid var(--color-border);
	}

	.dist-rows {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.dist-row {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}

	.dist-label {
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
