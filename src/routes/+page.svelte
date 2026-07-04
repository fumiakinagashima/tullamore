<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { createChatState, renderMarkdown, dashboard } from './index.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = createChatState(() => data);

	// suppress unused import warning
	void toast;
</script>

<div class="main">
	<section class="kpi">
		<p class="section-title">KPI達成状況</p>
		<div>
			...
		</div>
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
