<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { createChatState, renderMarkdown, dashboard } from './index.svelte';
	import type { PageData } from './$types';
	import GaugeChart from '$lib/components/ui/GaugeChart.svelte';

	let { data }: { data: PageData } = $props();
	const s = createChatState(() => data);

	// suppress unused import warning
	void toast;
</script>

<div class="main">
	<section class="kpi">
		<p class="section-title">KPI達成状況</p>
		{#if data.kpiAchievements.length > 0}
			<div class="kpi-gauges">
				{#each data.kpiAchievements as a (a.planId)}
					<a href="/kpi/{a.planId}" class="kpi-gauge-link">
						<GaugeChart title={a.name} value={a.current} target={a.targetValue} size={150} />
						<span class="kpi-gauge-period">{a.periodLabel}</span>
						{#if !a.hasActuals}
							<span class="kpi-gauge-note">この期間の実績データはまだありません</span>
						{:else if !a.periodScoped}
							<span class="kpi-gauge-note">期間未設定のため全期間のデータで計算</span>
						{/if}
					</a>
				{/each}
			</div>
		{:else}
			<p class="kpi-empty">
				KPIプランを作成すると、目的変数の実績と目標の達成率がここに表示されます。<a href="/kpi/new">KPIを作成する</a>
			</p>
		{/if}
	</section>
	
	{#each dashboard as d}
	<section class="{d.key}">
		<p class="section-title">{d.label}</p>
		<div class="list">
			{#each d.items as item}
			<a href={item.href} class="item">
				<div class="head">
					<span class="item-icon"><item.icon size={20} /></span>
					<p class="title">{item.title}</p>
				</div>
				<p class="desc">{item.desc}</p>
			</a>
			{/each}
		</div>
	</section>
	{/each}
</div>

<style lang="scss">
	.main {
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 56px;

	}
	.section-title {
		font-size: 0.9rem;
		color: var(--sidebar-text-muted);
	}
	.kpi-empty {
		margin-top: 16px;
		font-size: 0.875rem;
		color: var(--color-text-muted);

		a {
			color: var(--color-primary);
		}
	}
	.kpi-gauges {
		margin-top: 16px;
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.kpi-gauge-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 16px 20px;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 2px;
		text-decoration: none;
		transition: opacity 0.15s;

		&:hover {
			opacity: 0.8;
		}
	}
	.kpi-gauge-period {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.kpi-gauge-note {
		font-size: 0.6875rem;
		color: var(--color-warning);
	}
	.list {
		margin-top: 16px;
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		& .item {
			display: block;
			background-color: var(--color-surface);
			padding: 16px 24px;
			text-decoration: none;
			max-width: 340px;
			border: 1px solid var(--color-border);
			border-radius: 2px;
			&:hover {
				opacity: 0.8;
			}
			& .head {
				display: flex;
				gap: 4px;
				align-items: center;
			}
			& .item-icon {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 36px;
				height: 36px;
				margin-bottom: 10px;
				border-radius: 8px;
				background: color-mix(in srgb, var(--color-primary) 12%, transparent);
				color: var(--color-primary);
			}
			& .title {
				font-weight: 500;
				padding-bottom: 8px;
			}
			& .desc {
				font-size: 0.875rem;
			}
		}
	}
</style>
