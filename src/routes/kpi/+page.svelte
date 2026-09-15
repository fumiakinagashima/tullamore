<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import Flag from '$lib/components/icon/Flag.svelte';

	let { data }: { data: PageData } = $props();

	const PERIOD_TYPE_LABEL: Record<string, string> = { year: 'Annual', month: 'Monthly', week: 'Weekly', custom: 'Custom' };
	const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

	async function deletePlan(id: string, name: string) {
		if (!confirm(`Delete "${name}"?`)) return;
		await fetch(`/api/kpi-plans/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">KPI List</h1>
		<a href="/kpi/new" class="btn-secondary-sm">New</a>
	</div>
	<p class="page-desc">
		A list of created and saved KPI plans. Manage them by any period unit you like, such as annual, monthly, or weekly.
	</p>

	{#if data.plans.length === 0}
		<div class="empty">
			<Flag size={32} />
			<p>No saved KPI plans yet</p>
			<p class="empty-sub">Create a KPI plan from <a href="/kpi/new">New KPI</a> and save it.</p>
		</div>
	{:else}
		<div class="plan-grid">
			{#each data.plans as plan (plan.id)}
				<div class="plan-card">
					<div class="plan-info">
						<div class="plan-name">{plan.name}</div>
						<div class="plan-meta">
							<span class="period-badge">{PERIOD_TYPE_LABEL[plan.periodType] ?? plan.periodType}: {plan.periodLabel}</span>
							Target variable: {plan.targetColumn} · Target value: {numberFmt.format(plan.targetValue)}
							{#if !plan.achievable}<span class="achievable-badge">Projected to fall short</span>{/if}
						</div>
					</div>
					<div class="plan-actions">
						<a href="/kpi/{plan.id}" class="btn-secondary-sm">Details</a>
						<button class="btn-danger-sm" onclick={() => deletePlan(plan.id, plan.name)}>Delete</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.page {
		padding: 32px;
		width: 100%;
		max-width: var(--body-width-md);
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.page-title {
		font-size: 1.375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.page-desc {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 24px;
	}

	.btn-secondary-sm {
		padding: 5px 12px;
		background: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		text-decoration: none;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	.btn-danger-sm {
		padding: 5px 12px;
		background: transparent;
		color: var(--color-error);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 80px 24px;
		color: var(--color-text-muted);

		p { margin: 0; }
		.empty-sub {
			font-size: 0.875rem;

			a { color: var(--color-primary); }
		}
	}

	.plan-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.plan-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		transition: border-color 0.15s;

		&:hover { border-color: var(--color-primary); }
	}

	.plan-info { min-width: 0; }
	.plan-name { font-size: 0.9375rem; font-weight: 500; color: var(--color-text); }
	.plan-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 4px;
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

	.achievable-badge {
		display: inline-flex;
		padding: 1px 8px;
		background: color-mix(in srgb, var(--color-warning) 12%, var(--color-background));
		color: var(--color-warning);
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;
	}

	.plan-actions { display: flex; gap: 8px; flex-shrink: 0; }
</style>
