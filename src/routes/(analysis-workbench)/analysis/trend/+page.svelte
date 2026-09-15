<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { fitTrendFromRows, buildTrendSeries, type TrendRawRow, type TrendGranularity } from '$lib/analysis/trend';
	import { assessFitQuality, assessSampleSizeAdequacy, combineOverall, type ValidityAssessment } from '$lib/analysis/validity';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import LineChart from '$lib/components/ui/LineChart.svelte';
	import DataGrid from '$lib/components/ui/DataGrid.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	const HORIZON_OPTIONS = [
		{ value: '6', label: 'Up to 6 months ahead' },
		{ value: '12', label: 'Up to 1 year ahead' },
		{ value: '60', label: 'Up to 5 years ahead' }
	];

	const GRANULARITY_OPTIONS = [
		{ value: 'day', label: 'Daily' },
		{ value: 'week', label: 'Weekly' },
		{ value: 'month', label: 'Monthly' }
	];

	let dataSourceId = $state('');
	let dateColumn = $state('');
	let targetColumn = $state('');
	let horizonMonths = $state('12');
	// Select treats its value as a bindable string, so we hold it as a string and narrow it to TrendGranularity when used (the value is always one of GRANULARITY_OPTIONS' three options)
	let granularityValue = $state('month');
	const granularity = $derived(granularityValue as TrendGranularity);
	let note = $state('');
	let loading = $state(false);
	let error = $state('');
	let rows = $state<TrendRawRow[]>([]);
	let truncated = $state(false);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const dateOptions = $derived(
		(selectedSource?.columns ?? []).filter((c) => c.type === 'date').map((c) => ({ value: c.key, label: c.label }))
	);
	const targetOptions = $derived(
		selectedSource ? continuousColumns(selectedSource.columns).map((c) => ({ value: c.key, label: c.label })) : []
	);
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	$effect(() => {
		dataSourceId;
		dateColumn = '';
		targetColumn = '';
		rows = [];
		error = '';
	});

	const canRun = $derived(!!dataSourceId && !!dateColumn && !!targetColumn);

	const gridColumns = $derived([
		{ key: 'date', label: labelOf(dateColumn) || 'Date', type: 'date' as const },
		{ key: 'value', label: labelOf(targetColumn) || 'Value', type: 'number' as const }
	]);

	// Editing a value in the grid re-trains and recomputes on the spot without a server round trip (same idea as the regression simulator's sliders)
	const liveModel = $derived.by(() => {
		if (rows.length === 0) return null;
		try {
			return fitTrendFromRows(rows);
		} catch {
			return null;
		}
	});

	const liveSeries = $derived.by(() => {
		if (!liveModel) return null;
		try {
			return buildTrendSeries(rows, liveModel, Number(horizonMonths), granularity);
		} catch {
			return null;
		}
	});

	// Trend forecasting has only one feature variable ("time", TREND_TIME_FEATURE), so multicollinearity checks are out of scope.
	// No D1 query is needed, so this is done entirely client-side (no server round trip, same idea as the other calculations)
	const validity = $derived.by<ValidityAssessment | null>(() => {
		const m = liveModel;
		if (!m) return null;
		const checks = [assessFitQuality(m.metrics.r2), assessSampleSizeAdequacy(m.metrics.sampleSize, m.featureColumns.length)];
		const { overallLevel, overallComment } = combineOverall(checks, 'This trend forecast found no issues on the main validity check criteria');
		return { overallLevel, overallComment, checks };
	});

	const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	// The coefficient is the change "per day". Convert it to a change matching the currently selected aggregation granularity (30.44 is the average number of days per month = 365.25/12)
	const PERIOD_DAYS: Record<TrendGranularity, number> = { day: 1, week: 7, month: 30.44 };
	const PERIOD_LABEL: Record<TrendGranularity, string> = { day: 'Change per day', week: 'Change per week', month: 'Change per month' };
	const PERIOD_AVG_LABEL: Record<TrendGranularity, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
	const periodChange = $derived(liveModel ? liveModel.coefficients[0] * PERIOD_DAYS[granularity] : 0);
	const direction = $derived(periodChange > 0 ? 'up' : periodChange < 0 ? 'down' : 'flat');
	const forecastEnd = $derived(liveSeries ? liveSeries.trend[liveSeries.trend.length - 1] : null);
	// Draw a vertical line at the boundary between actuals and the forecast (i.e., "now"). Use a fractional index of -0.5 to place it exactly between the two points
	const markerIndex = $derived(liveSeries ? liveSeries.historicalCount - 0.5 : undefined);

	// Pass the current settings and results to the AI assistant on the right (also used as material when asked about validity)
	$effect(() => {
		bridge.analysisType = 'trend';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			date_column: dateColumn || undefined,
			target_column: targetColumn || undefined,
			horizon_months: Number(horizonMonths),
			granularity
		};
		const m = liveModel;
		bridge.resultSummary = m
			? {
					target_column: m.targetColumn,
					granularity,
					change_per_period: periodChange,
					r2: m.metrics.r2,
					adjusted_r2: m.metrics.adjustedR2,
					sample_size: m.metrics.sampleSize,
					validity: validity ? { overall: validity.overallLevel, comment: validity.overallComment } : undefined
				}
			: null;
	});

	// Called from the AI assistant's set_config tool. Changing dataSourceId causes
	// the $effect above to reset dateColumn/targetColumn, so we wait for that
	// reset to run first via tick() before setting the values
	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (typeof patch.date_column === 'string') dateColumn = patch.date_column;
		if (typeof patch.target_column === 'string') targetColumn = patch.target_column;
		if (typeof patch.horizon_months === 'number') horizonMonths = String(patch.horizon_months);
		if (patch.granularity === 'day' || patch.granularity === 'week' || patch.granularity === 'month') {
			granularityValue = patch.granularity;
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
			const res = await fetch(`/api/data-sources/${dataSourceId}/rows?limit=1000`);
			const body = (await res.json()) as { rows?: Record<string, unknown>[]; total?: number; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'Failed to fetch data');

			const fetched = body.rows ?? [];
			const cleaned = fetched
				.map((r) => ({ date: String(r[dateColumn] ?? ''), value: Number(r[targetColumn]) }))
				.filter((r) => r.date && Number.isFinite(r.value))
				.sort((a, b) => a.date.localeCompare(b.date));

			if (cleaned.length === 0) throw new Error('No rows found with both a date and a numeric value');

			truncated = (body.total ?? fetched.length) > fetched.length;
			rows = cleaned;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			rows = [];
		} finally {
			loading = false;
		}
	}
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">Trend Forecast</h1>
		<p class="page-sub">Forecasts future trajectories from historical data as a line (switch the aggregation granularity between daily, weekly, and monthly)</p>
	</div>

	<section class="config-panel">
		<p class="config-title">Settings</p>
		<div class="config-row">
			<Select label="Data Source" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="Date Column" bind:value={dateColumn} options={dateOptions} disabled={!dataSourceId} />
			<Select label="Target Variable" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="config-row">
			<Select label="Aggregation Granularity" bind:value={granularityValue} options={GRANULARITY_OPTIONS} />
			<Select label="Forecast Period" bind:value={horizonMonths} options={HORIZON_OPTIONS} />
		</div>

		<Textbox label="Analysis Notes (optional)" bind:value={note} placeholder="e.g., I want to see membership trends over the next year" />

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? 'Forecasting…' : 'Run Forecast'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if liveModel && liveSeries}
			<div class="results-card">
				<div class="metrics-row">
					<div class="metric">
						<span class="metric-label">{PERIOD_LABEL[granularity]}</span>
						<span class="metric-value" class:up={direction === 'up'} class:down={direction === 'down'}>
							{periodChange >= 0 ? '+' : ''}{fmt(periodChange)}
						</span>
					</div>
					<div class="metric">
						<span class="metric-label">R² (coefficient of determination)</span>
						<span class="metric-value">{fmt(liveModel.metrics.r2)}</span>
					</div>
					<div class="metric">
						<span class="metric-label">Sample Size</span>
						<span class="metric-value">{liveModel.metrics.sampleSize}</span>
					</div>
					{#if forecastEnd}
						<div class="metric">
							<span class="metric-label">Forecast at {forecastEnd.label}</span>
							<span class="metric-value highlight">{fmt(forecastEnd.value)}</span>
						</div>
					{/if}
				</div>

				<LineChart
					height={180}
					{markerIndex}
					markerLabel="Now"
					series={[
						{ name: `Actual (${PERIOD_AVG_LABEL[granularity]} average)`, data: liveSeries.historical },
						{ name: 'Trend Forecast', data: liveSeries.trend }
					]}
				/>

				{#if validity}
					<ValidityCard {validity} />
				{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>Select a data source, date column, and target variable in the settings panel above, then click "Run Forecast"</p>
			</div>
		{/if}
	</section>

	{#if rows.length > 0}
		<section class="grid-panel">
			<p class="config-title">Source Data (editing a value updates the chart immediately)</p>
			{#if truncated}
				<p class="hint">Showing and analyzing only the first {rows.length} rows because there are too many rows</p>
			{/if}
			<DataGrid columns={gridColumns} bind:rows maxHeight={320} />
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

	.results-panel { margin: 24px 0; }

	.grid-panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 24px;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.empty-results {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 320px;
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

		&.up { color: var(--color-success); }
		&.down { color: var(--color-error); }
		&.highlight { color: var(--color-primary); font-size: 1.125rem; }
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
