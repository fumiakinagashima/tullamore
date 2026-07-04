<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import type { CorrelationMatrix } from '$lib/analysis/correlation-matrix';
	import type { KpiPlanResult, KpiPlanSnapshot } from '$lib/analysis/kpi';
	import { planKpis } from '$lib/analysis/kpi';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';
	import Table from '$lib/components/ui/Table.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	const PERIOD_TYPE_OPTIONS = [
		{ value: 'year', label: '年次' },
		{ value: 'month', label: '月次' },
		{ value: 'week', label: '週次' },
		{ value: 'custom', label: '自由入力' }
	];

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let targetValueText = $state('');
	let periodType = $state<'year' | 'month' | 'week' | 'custom'>('year');
	let periodLabel = $state('');
	let loading = $state(false);
	let error = $state('');

	let model = $state<LinearRegressionModel | null>(null);
	let validity = $state<ValidityAssessment | null>(null);
	let plan = $state<KpiPlanResult | null>(null);

	let correlations = $state<Record<string, number>>({});
	let correlationsLoading = $state(false);

	let saving = $state(false);
	let saveError = $state('');
	let planName = $state('');

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(
		numericColumns
			.filter((c) => c.key !== targetColumn)
			.map((c) => ({ ...c, correlation: correlations[c.key] }))
			.sort((a, b) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0))
	);
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));
	const targetValue = $derived(targetValueText === '' ? null : Number(targetValueText));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	function resetResults() {
		model = null;
		validity = null;
		plan = null;
	}

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		correlations = {};
		resetResults();
		error = '';
	});

	// 目的変数を選んだら、KPI候補の相関を先に確認できるようにする（度外れなKPI候補選択を防ぐガードレール）
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
				// 相関の取得に失敗しても致命的ではないため無視する（候補選択のヒントが出ないだけ）
			} finally {
				correlationsLoading = false;
			}
		})();
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

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
			if (!res.ok) throw new Error(body.error ?? 'モデルの学習に失敗しました');
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
		if (!model || !plan || !validity || !planName.trim() || !periodLabel.trim()) return;
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
			const res = await fetch('/api/kpi-plans', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: planName.trim(), dataSourceId, targetColumn, periodLabel: periodLabel.trim(), periodType, snapshot })
			});
			const body = (await res.json()) as { id?: string; error?: string };
			if (!res.ok) throw new Error(body.error ?? '保存に失敗しました');
			await goto(`/kpi/${body.id}`);
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	const tableColumns = [
		{ key: 'label', label: 'KPI項目' },
		{ key: 'current', label: '現在値' },
		{ key: 'target', label: '目標値' },
		{ key: 'delta', label: '増減' },
		{ key: 'range', label: '実測レンジ' }
	];

	const tableRows = $derived(
		plan
			? plan.items.map((i) => ({
					label: labelOf(i.key),
					current: fmt(i.current),
					target: fmt(i.target),
					delta: (i.target - i.current >= 0 ? '+' : '') + fmt(i.target - i.current),
					range: `${fmt(i.min)} 〜 ${fmt(i.max)}`
				}))
			: []
	);
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">KPI設定</h1>
		<p class="page-sub">目的変数の目標値から、KPI候補（説明変数）の目標値を実測レンジ内に収まる形で逆算します</p>
	</div>

	<section class="results-panel">
		{#if plan && validity}
			<div class="results-card">
				<ValidityCard {validity} />

				{#if !plan.achievable}
					<p class="warning-text">
						選択したKPI候補の実測レンジ内だけでは目標に届きません（不足分: {fmt(plan.gap - plan.coveredGap)}）。
						目標値を見直すか、KPI候補を追加してください。以下は実測レンジ内で最大限に近づけた場合の目標値です。
					</p>
				{/if}

				<div class="metrics-row">
					<div class="metric"><span class="metric-label">現状の予測値</span><span class="metric-value">{fmt(plan.baseline)}</span></div>
					<div class="metric"><span class="metric-label">目標値</span><span class="metric-value highlight">{fmt(plan.targetValue)}</span></div>
					<div class="metric"><span class="metric-label">差分</span><span class="metric-value">{plan.gap >= 0 ? '+' : ''}{fmt(plan.gap)}</span></div>
				</div>

				<Table columns={tableColumns} rows={tableRows} />

				<div class="save-row">
					<Textbox label="このKPIプランの名前" bind:value={planName} placeholder="例: 2027年度 売上目標KPI" />
					<button class="run-btn" onclick={savePlan} disabled={saving || !planName.trim() || !periodLabel.trim()}>
						{saving ? '保存中…' : '保存する'}
					</button>
				</div>
				{#if saveError}<p class="error-text">{saveError}</p>{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>下の設定欄でデータソース・目的変数・KPI候補・目標値・期間を選び、「KPIを作成」を押してください</p>
			</div>
		{/if}
	</section>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="目的変数" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
			<Textbox label="目的変数の目標値" type="number" bind:value={targetValueText} />
		</div>

		<div class="config-row">
			<Select label="期間の種類" bind:value={periodType} options={PERIOD_TYPE_OPTIONS} />
			<Textbox label="期間ラベル" bind:value={periodLabel} placeholder="例: 2027年度 / 2026年7月 / 第3四半期" />
		</div>

		<div class="feature-picker">
			<span class="field-label">
				KPI候補（説明変数、複数選択可）
				{#if correlationsLoading}<span class="hint-inline">相関を確認中…</span>{/if}
			</span>
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
				{loading ? '計算中…' : 'KPIを作成'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
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
