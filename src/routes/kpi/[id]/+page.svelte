<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';
	import Table from '$lib/components/ui/Table.svelte';
	import GaugeChart from '$lib/components/ui/GaugeChart.svelte';
	import ReportModal from '$lib/components/analysis/ReportModal.svelte';

	let { data }: { data: PageData } = $props();
	let { plan, snapshot, columns, dataSourceName, achievement } = $derived(data);

	const PERIOD_TYPE_LABEL: Record<string, string> = { year: '年次', month: '月次', week: '週次', custom: '自由' };

	function labelOf(key: string): string {
		return columns.find((c) => c.key === key)?.label ?? key;
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
		snapshot.plan.items.map((i) => ({
			label: labelOf(i.key),
			current: fmt(i.current),
			target: fmt(i.target),
			delta: (i.target - i.current >= 0 ? '+' : '') + fmt(i.target - i.current),
			range: `${fmt(i.min)} 〜 ${fmt(i.max)}`
		}))
	);

	let reportModalOpen = $state(false);
	let reportLoading = $state(false);
	let report = $state<string | null>(null);
	let reportError = $state<string | null>(null);

	async function createReport() {
		reportModalOpen = true;
		reportLoading = true;
		report = null;
		reportError = null;
		try {
			const res = await fetch('/api/analysis/report', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					analysisType: 'kpi-planning',
					config: {
						data_source_id: snapshot.dataSourceId,
						target_column: snapshot.targetColumn,
						feature_columns: snapshot.featureColumns
					},
					resultSummary: {
						period: `${PERIOD_TYPE_LABEL[plan.periodType] ?? plan.periodType}: ${plan.periodLabel}`,
						target_column: snapshot.targetColumn,
						target_value: snapshot.plan.targetValue,
						baseline: snapshot.plan.baseline,
						gap: snapshot.plan.gap,
						achievable: snapshot.plan.achievable,
						covered_gap: snapshot.plan.coveredGap,
						items: Object.fromEntries(snapshot.plan.items.map((i) => [labelOf(i.key), { current: i.current, target: i.target }])),
						validity: { overall: snapshot.validity.overallLevel, comment: snapshot.validity.overallComment }
					}
				})
			});
			const body = (await res.json()) as { report?: string; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'レポートの作成に失敗しました');
			report = body.report ?? null;
		} catch (e) {
			reportError = e instanceof Error ? e.message : String(e);
		} finally {
			reportLoading = false;
		}
	}

	async function deletePlan() {
		if (!confirm(`「${plan.name}」を削除しますか？`)) return;
		await fetch(`/api/kpi-plans/${plan.id}`, { method: 'DELETE' });
		await goto('/kpi');
	}
</script>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">{plan.name}</h1>
			<p class="page-sub">
				<span class="period-badge">{PERIOD_TYPE_LABEL[plan.periodType] ?? plan.periodType}: {plan.periodLabel}</span>
				{#if dataSourceName}データソース: {dataSourceName} ·{/if}
				目的変数: {labelOf(snapshot.targetColumn)}
			</p>
		</div>
		<div class="header-actions">
			<a href="/kpi/{plan.id}/build" class="btn-secondary">編集</a>
			<button class="btn-secondary" onclick={createReport}>レポートを作成</button>
			<button class="btn-danger" onclick={deletePlan}>削除</button>
		</div>
	</div>

	<div class="results-card">
		<ValidityCard validity={snapshot.validity} />

		{#if !snapshot.plan.achievable}
			<p class="warning-text">
				選択したKPI候補の実測レンジ内だけでは目標に届きません（不足分: {fmt(snapshot.plan.gap - snapshot.plan.coveredGap)}）。
			</p>
		{/if}

		{#if achievement}
			<div class="achievement-row">
				{#if achievement.hasActuals}
					<GaugeChart value={achievement.current} target={achievement.targetValue} size={170} />
				{/if}
				<p class="achievement-note">
					{#if !achievement.hasActuals}
						対象期間（{achievement.periodLabel}）の実績データはまだありません。データが登録されると達成率が表示されます。
					{:else}
						目的変数「{labelOf(achievement.targetColumn)}」の
						{#if achievement.periodScoped}
							指定した期間内の平均値
						{:else}
							現在の平均値（期間未設定のため全期間が対象）
						{/if}
						と目標値から算出した達成率です（データソースの最新の値を都度再取得します）。
					{/if}
				</p>
			</div>
		{/if}

		<div class="metrics-row">
			<div class="metric"><span class="metric-label">現状の予測値</span><span class="metric-value">{fmt(snapshot.plan.baseline)}</span></div>
			<div class="metric"><span class="metric-label">目標値</span><span class="metric-value highlight">{fmt(snapshot.plan.targetValue)}</span></div>
			<div class="metric"><span class="metric-label">差分</span><span class="metric-value">{snapshot.plan.gap >= 0 ? '+' : ''}{fmt(snapshot.plan.gap)}</span></div>
		</div>

		<Table columns={tableColumns} rows={tableRows} />
	</div>
</div>

<ReportModal
	open={reportModalOpen}
	loading={reportLoading}
	report={report}
	error={reportError}
	onClose={() => (reportModalOpen = false)}
/>

<style lang="scss">
	.page {
		padding: 32px;
		max-width: 900px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}

	.page-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 6px;
	}

	.page-sub {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.period-badge {
		display: inline-flex;
		padding: 1px 8px;
		background: var(--color-neutral-bg);
		color: var(--color-neutral);
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;
	}

	.header-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.btn-secondary {
		display: inline-block;
		padding: 6px 14px;
		background: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		text-decoration: none;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-surface); }
	}

	.btn-danger {
		padding: 6px 14px;
		background: transparent;
		color: var(--color-error);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-error-bg); }
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

	.achievement-row {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 12px 4px;
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
	}

	.achievement-note {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
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
</style>
