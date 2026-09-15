<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LogisticRegressionModel } from '$lib/analysis/methods/logistic-regression';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import { continuousColumns, inferAnalysisColumnType } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Table from '$lib/components/ui/Table.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let model = $state<LogisticRegressionModel | null>(null);
	let validity = $state<ValidityAssessment | null>(null);
	let truncated = $state(false);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	// The target variable can be either a numeric or categorical column as long as it's binary (id/date columns are excluded)
	const targetCandidates = $derived(
		selectedSource?.columns.filter((c) => {
			const t = inferAnalysisColumnType(c);
			return t !== 'id' && t !== 'date';
		}) ?? []
	);
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));
	const targetOptions = $derived(targetCandidates.map((c) => ({ value: c.key, label: c.label })));
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
		error = '';
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	// When the target variable is switched, drop any previously selected explanatory-variable column
	// that now duplicates the new target variable (it disappears from featureCandidates automatically,
	// but the checked state itself would otherwise remain in featureColumns)
	$effect(() => {
		if (featureColumns.includes(targetColumn)) {
			featureColumns = featureColumns.filter((k) => k !== targetColumn);
		}
	});

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);

	$effect(() => {
		bridge.analysisType = 'classification';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		bridge.resultSummary = model
			? {
					positive_class: model.positiveClassLabel,
					accuracy: model.metrics.accuracy,
					precision: model.metrics.precision,
					recall: model.metrics.recall,
					f1: model.metrics.f1,
					pseudo_r2: model.metrics.pseudoR2,
					converged: model.metrics.converged,
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
			const res = await fetch('/api/analysis/classification', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, targetColumn, featureColumns })
			});
			const body = (await res.json()) as {
				model?: LogisticRegressionModel;
				truncated?: boolean;
				validity?: ValidityAssessment;
				error?: string;
			};
			if (!res.ok) throw new Error(body.error ?? 'Analysis failed');
			model = body.model ?? null;
			validity = body.validity ?? null;
			truncated = body.truncated ?? false;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}
	function fmtPct(n: number): string {
		return `${(n * 100).toFixed(1)}%`;
	}

	const coefficientRows = $derived(
		model
			? model.featureColumns.map((key, i) => ({
					variable: labelOf(key),
					coefficient: fmt(model!.coefficients[i]),
					odds_ratio: fmt(Math.exp(model!.coefficients[i]))
				}))
			: []
	);
	const coefficientColumns = [
		{ key: 'variable', label: 'Explanatory variable' },
		{ key: 'coefficient', label: 'Coefficient (log-odds)' },
		{ key: 'odds_ratio', label: 'Odds ratio' }
	];
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">Logistic Regression / Classification</h1>
		<p class="page-sub">Builds a model that predicts the probability of a binary target variable (e.g. purchased/not purchased, churned/not churned) from explanatory variables</p>
	</div>

	<section class="config-panel">
		<p class="config-title">Settings</p>
		<div class="config-row">
			<Select label="Data source" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="Target variable (binary)" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="feature-picker">
			<span class="field-label">Explanatory variables (numeric columns, multiple selection allowed)</span>
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
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? 'Building model…' : 'Build model'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if model}
			<div class="results-card">
				{#if truncated}
					<p class="warning-text">The dataset is large, so the model was trained on only the first {model.metrics.sampleSize.toLocaleString()} rows.</p>
				{/if}
				<p class="positive-class-note">Value treated as the positive class (1): <strong>{model.positiveClassLabel}</strong></p>

				<div class="content-row">
					<div class="confusion-matrix">
						<p class="subsection-title">Confusion matrix</p>
						<table class="cm-table">
							<thead>
								<tr>
									<th></th>
									<th>Predicted: positive</th>
									<th>Predicted: negative</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<th>Actual: positive</th>
									<td class="cm-correct">{model.confusionMatrix.truePositive}</td>
									<td>{model.confusionMatrix.falseNegative}</td>
								</tr>
								<tr>
									<th>Actual: negative</th>
									<td>{model.confusionMatrix.falsePositive}</td>
									<td class="cm-correct">{model.confusionMatrix.trueNegative}</td>
								</tr>
							</tbody>
						</table>
					</div>

					<div class="metrics-row">
						<div class="metric">
							<span class="metric-label">Accuracy</span>
							<span class="metric-value highlight">{fmtPct(model.metrics.accuracy)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">Precision</span>
							<span class="metric-value">{fmtPct(model.metrics.precision)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">Recall</span>
							<span class="metric-value">{fmtPct(model.metrics.recall)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">F1 score</span>
							<span class="metric-value">{fmt(model.metrics.f1)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">Pseudo-R² (McFadden)</span>
							<span class="metric-value">{fmt(model.metrics.pseudoR2)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">Sample size</span>
							<span class="metric-value">{model.metrics.sampleSize.toLocaleString()}</span>
						</div>
					</div>
				</div>

				<div>
					<p class="subsection-title">Coefficients (an odds ratio greater than 1 means it pushes toward the positive class)</p>
					<Table columns={coefficientColumns} rows={coefficientRows} />
				</div>

				{#if validity}
					<ValidityCard {validity} />
				{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>Choose a data source, target variable (binary), and explanatory variables in the settings above, then click "Build model"</p>
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
		background: var(--color-neutral-bg);
		border-radius: 6px;
		padding: 8px 12px;
		margin: 0;
	}

	.positive-class-note {
		font-size: 0.8125rem;
		color: var(--color-text);
		margin: 0;
	}

	.content-row {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
	}

	.subsection-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0 0 8px;
	}

	.cm-table {
		border-collapse: collapse;
		font-size: 0.8125rem;

		th, td {
			padding: 8px 12px;
			border: 1px solid var(--color-border);
			text-align: center;
		}
		th {
			color: var(--color-text-muted);
			font-weight: 500;
		}
		.cm-correct {
			font-weight: 700;
			color: var(--color-primary);
		}
	}

	.metrics-row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 24px;
		align-content: flex-start;
		flex: 1;
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
