<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import type { CorrelationMatrix } from '$lib/analysis/correlation-matrix';
	import type { KpiPlanResult, KpiPlanSnapshot } from '$lib/analysis/kpi';
	import { planKpis } from '$lib/analysis/kpi';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import DatePicker from '$lib/components/ui/DatePicker.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';
	import Table from '$lib/components/ui/Table.svelte';

	type SourceInfo = { id: string; name: string; columns: { key: string; label: string; type: 'text' | 'number' | 'date' | 'boolean' }[] };

	type Initial = {
		name: string;
		dataSourceId: string;
		targetColumn: string;
		featureColumns: string[];
		targetValue: number;
		periodType: 'year' | 'month' | 'week' | 'custom';
		periodLabel: string;
		dateColumn: string | null;
		periodFrom: string | null;
		periodTo: string | null;
		model: LinearRegressionModel;
		validity: ValidityAssessment;
		plan: KpiPlanResult;
	};

	let { sources, mode, planId, initial }: {
		sources: SourceInfo[];
		mode: 'create' | 'edit';
		planId?: string;
		initial?: Initial;
	} = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	const PERIOD_TYPE_OPTIONS = [
		{ value: 'year', label: 'Annual' },
		{ value: 'month', label: 'Monthly' },
		{ value: 'week', label: 'Weekly' },
		{ value: 'custom', label: 'Custom' }
	];

	let dataSourceId = $state(initial?.dataSourceId ?? '');
	let targetColumn = $state(initial?.targetColumn ?? '');
	let featureColumns = $state<string[]>(initial?.featureColumns ?? []);
	let targetValueText = $state(initial ? String(initial.targetValue) : '');
	let periodType = $state<'year' | 'month' | 'week' | 'custom'>(initial?.periodType ?? 'year');
	let periodLabel = $state(initial?.periodLabel ?? '');
	let dateColumn = $state(initial?.dateColumn ?? '');
	let periodFrom = $state(initial?.periodFrom ?? '');
	let periodTo = $state(initial?.periodTo ?? '');
	let loading = $state(false);
	let error = $state('');

	let model = $state<LinearRegressionModel | null>(initial?.model ?? null);
	let validity = $state<ValidityAssessment | null>(initial?.validity ?? null);
	let plan = $state<KpiPlanResult | null>(initial?.plan ?? null);

	let correlations = $state<Record<string, number>>({});
	let correlationsLoading = $state(false);

	let saving = $state(false);
	let saveError = $state('');
	let planName = $state(initial?.name ?? '');

	const selectedSource = $derived(sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(
		numericColumns
			.filter((c) => c.key !== targetColumn)
			.map((c) => ({ ...c, correlation: correlations[c.key] }))
			.sort((a, b) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0))
	);
	const sourceOptions = $derived(sources.map((s) => ({ value: s.id, label: s.name })));
	const targetValue = $derived(targetValueText === '' ? null : Number(targetValueText));

	// Only require the achievement-tracking target period (date column + FROM/TO) when this data source has a date column
	const dateCandidates = $derived(selectedSource ? selectedSource.columns.filter((c) => c.type === 'date') : []);
	const dateOptions = $derived(dateCandidates.map((c) => ({ value: c.key, label: c.label })));
	const needsPeriodRange = $derived(dateCandidates.length > 0);
	const periodRangeValid = $derived(!needsPeriodRange || (!!dateColumn && !!periodFrom && !!periodTo && periodFrom <= periodTo));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	function resetResults() {
		model = null;
		validity = null;
		plan = null;
	}

	// Only reset the downstream settings when the data source is switched (must not fire on initial render or edit-mode prefill)
	let prevDataSourceId = dataSourceId;
	$effect(() => {
		if (dataSourceId === prevDataSourceId) return;
		prevDataSourceId = dataSourceId;
		targetColumn = '';
		featureColumns = [];
		correlations = {};
		dateColumn = '';
		periodFrom = '';
		periodTo = '';
		resetResults();
		error = '';
	});

	// Once the target variable is chosen, let the user check KPI candidate correlations up front (a guardrail against picking an outlandish KPI candidate)
	$effect(() => {
		const src = selectedSource;
		const target = targetColumn;
		if (!src || !target) {
			correlations = {};
			return;
		}
		const candidates = continuousColumns(src.columns).filter((c) => c.key !== target);
		if (candidates.length === 0) {
			correlations = {};
			return;
		}
		correlationsLoading = true;
		(async () => {
			try {
				const res = await fetch('/api/analysis/correlation', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ dataSourceId: src.id, columns: [target, ...candidates.map((c) => c.key)] })
				});
				const body = (await res.json()) as { matrix?: CorrelationMatrix };
				if (!body.matrix) return;
				const map: Record<string, number> = {};
				body.matrix.columns.forEach((key, i) => {
					if (i === 0) return;
					map[key] = body.matrix!.matrix[0][i];
				});
				correlations = map;
			} catch {
				// Not fatal if fetching correlations fails — just means candidate-selection hints won't show
			} finally {
				correlationsLoading = false;
			}
		})();
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	// When the target variable is switched, drop any previously selected KPI candidate column that now duplicates the new target
	// (it disappears from featureCandidates automatically, but the checked state itself would otherwise remain in featureColumns)
	$effect(() => {
		if (featureColumns.includes(targetColumn)) {
			featureColumns = featureColumns.filter((k) => k !== targetColumn);
		}
	});

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0 && targetValue !== null);

	$effect(() => {
		bridge.analysisType = 'kpi-planning';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		bridge.resultSummary =
			plan && validity
				? {
						target_column: targetColumn,
						target_value: plan.targetValue,
						baseline: plan.baseline,
						gap: plan.gap,
						achievable: plan.achievable,
						covered_gap: plan.coveredGap,
						items: Object.fromEntries(plan.items.map((i) => [i.key, { current: i.current, target: i.target }])),
						validity: { overall: validity.overallLevel, comment: validity.overallComment }
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
	}

	$effect(() => {
		bridge.applyConfig = applyConfig;
		return () => {
			if (bridge.applyConfig === applyConfig) bridge.applyConfig = null;
		};
	});

	async function run() {
		if (!canRun || targetValue === null) return;
		loading = true;
		error = '';
		resetResults();
		try {
			const res = await fetch('/api/analysis/regression', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, targetColumn, featureColumns })
			});
			const body = (await res.json()) as { model?: LinearRegressionModel; validity?: ValidityAssessment; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'Failed to train the model');
			model = body.model ?? null;
			validity = body.validity ?? null;
			if (model) {
				plan = planKpis(model, targetValue);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	async function savePlan() {
		if (!model || !plan || !validity || !planName.trim() || !periodLabel.trim() || !periodRangeValid) return;
		saving = true;
		saveError = '';
		try {
			const snapshot: KpiPlanSnapshot = {
				dataSourceId,
				targetColumn,
				featureColumns,
				targetValue: plan.targetValue,
				model,
				validity,
				plan
			};
			const body = JSON.stringify({
				name: planName.trim(),
				dataSourceId,
				targetColumn,
				periodLabel: periodLabel.trim(),
				periodType,
				dateColumn: dateColumn || null,
				periodFrom: periodFrom || null,
				periodTo: periodTo || null,
				snapshot
			});
			const res =
				mode === 'edit'
					? await fetch(`/api/kpi-plans/${planId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
					: await fetch('/api/kpi-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
			const resBody = (await res.json()) as { id?: string; error?: string };
			if (!res.ok) throw new Error(resBody.error ?? 'Failed to save');
			await goto(`/kpi/${mode === 'edit' ? planId : resBody.id}`);
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	const tableColumns = [
		{ key: 'label', label: 'KPI item' },
		{ key: 'current', label: 'Current' },
		{ key: 'target', label: 'Target' },
		{ key: 'delta', label: 'Change' },
		{ key: 'range', label: 'Observed range' }
	];

	const tableRows = $derived(
		plan
			? plan.items.map((i) => ({
					label: labelOf(i.key),
					current: fmt(i.current),
					target: fmt(i.target),
					delta: (i.target - i.current >= 0 ? '+' : '') + fmt(i.target - i.current),
					range: `${fmt(i.min)} - ${fmt(i.max)}`
				}))
			: []
	);
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">{mode === 'edit' ? 'Edit KPI' : 'New KPI'}</h1>
		<p class="page-sub">Back-calculates target values for KPI candidates (feature variables) from the target variable's goal, keeping them within the observed range</p>
	</div>

	<section class="config-panel">
		<p class="config-title">Settings</p>
		<div class="config-row">
			<Select label="Data source" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="Target variable" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
			<div class="field-narrow">
				<Textbox label="Target variable goal" type="number" bind:value={targetValueText} />
			</div>
		</div>

		<div class="config-row">
			<Select label="Period type" bind:value={periodType} options={PERIOD_TYPE_OPTIONS} />
			<Textbox label="Period label" bind:value={periodLabel} placeholder="e.g. FY2027 / July 2026 / Q3" />
		</div>

		{#if dataSourceId}
			{#if needsPeriodRange}
				<div class="config-row">
					<Select label="Date column for achievement tracking" bind:value={dateColumn} options={dateOptions} />
					<div class="field-narrow">
						<DatePicker label="Period FROM" bind:value={periodFrom} required max={periodTo || undefined} />
					</div>
					<div class="field-narrow">
						<DatePicker label="Period TO" bind:value={periodTo} required min={periodFrom || undefined} />
					</div>
				</div>
				<p class="hint">
					Achievement tracking (the current actuals and achievement-rate gauge) is calculated only over rows whose date column falls within the FROM-TO range.
					Training of the regression model itself still uses the data source's full history, as before.
				</p>
			{:else}
				<p class="hint">This data source has no date-type column, so achievement tracking is calculated over the data source's full history.</p>
			{/if}
		{/if}

		<div class="feature-picker">
			<span class="field-label">
				KPI candidates (feature variables, multiple selection allowed)
				{#if correlationsLoading}<span class="hint-inline">Checking correlations…</span>{/if}
			</span>
			{#if !targetColumn}
				<p class="hint">Select a target variable first</p>
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
							{#if col.correlation !== undefined}
								<span class="corr-hint">(r={fmt(col.correlation)})</span>
							{/if}
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? 'Calculating…' : 'Create KPI'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if plan && validity}
			<div class="results-card">
				{#if !plan.achievable}
					<p class="warning-text">
						The selected KPI candidates can't reach the goal within their observed ranges alone (shortfall: {fmt(plan.gap - plan.coveredGap)}).
						Reconsider the target value or add more KPI candidates. The values below are the closest achievable targets within the observed ranges.
					</p>
				{/if}

				<div class="metrics-row">
					<div class="metric"><span class="metric-label">Current predicted value</span><span class="metric-value">{fmt(plan.baseline)}</span></div>
					<div class="metric"><span class="metric-label">Target value</span><span class="metric-value highlight">{fmt(plan.targetValue)}</span></div>
					<div class="metric"><span class="metric-label">Difference</span><span class="metric-value">{plan.gap >= 0 ? '+' : ''}{fmt(plan.gap)}</span></div>
				</div>

				<Table columns={tableColumns} rows={tableRows} />

				<ValidityCard {validity} />

				{#if needsPeriodRange && !periodRangeValid}
					<p class="warning-text">To save, specify the achievement-tracking target period (date column and period FROM/TO) in the settings above.</p>
				{/if}

				<div class="save-row">
					<div class="name-field">
						<Textbox label="Name of this KPI plan" bind:value={planName} placeholder="e.g. FY2027 revenue target KPI" />
					</div>
					<button class="run-btn" onclick={savePlan} disabled={saving || !planName.trim() || !periodLabel.trim() || !periodRangeValid}>
						{saving ? 'Saving…' : mode === 'edit' ? 'Update' : 'Save'}
					</button>
				</div>
				{#if saveError}<p class="error-text">{saveError}</p>{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>Choose a data source, target variable, KPI candidates, target value, and period in the settings above, then click "Create KPI"</p>
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.module-page {
		padding: 24px 32px 40px;
		width: 100%;
		max-width: var(--body-width-md);
		margin: 0 auto;
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
		background: color-mix(in srgb, var(--color-warning) 12%, var(--color-background));
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

	.save-row {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		padding-top: 8px;
		border-top: 1px solid var(--color-border);
	}

	.name-field {
		flex: 1;
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
		display: flex;
		flex-wrap: wrap;
		gap: 12px;

		> :global(*) { flex: 1 1 240px; min-width: 0; }
		> .field-narrow { flex: 0 0 170px; }
	}

	.feature-picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.hint-inline {
		font-size: 0.75rem;
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

	.corr-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
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
