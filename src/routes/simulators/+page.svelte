<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import Sparkles from '$lib/components/icon/Sparkles.svelte';

	let { data }: { data: PageData } = $props();

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });

	async function deleteSimulator(id: string, name: string) {
		if (!confirm(`「${name}」を削除しますか？`)) return;
		await fetch(`/api/simulators/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">シミュレーター</h1>
	</div>
	<p class="page-desc">チャットでAIに依頼して作成したシミュレーターの一覧です。「〇〇を予測するシミュレーターを作って」のように依頼すると作成されます。</p>

	{#if data.simulators.length === 0}
		<div class="empty">
			<Sparkles size={32} />
			<p>シミュレーターがまだありません</p>
			<p class="empty-sub">メインチャットで「〇〇を予測するシミュレーターを作って」のように依頼してください。</p>
		</div>
	{:else}
		<div class="sim-grid">
			{#each data.simulators as sim (sim.id)}
				<div class="sim-card">
					<div class="sim-info">
						<div class="sim-name">{sim.name}</div>
						{#if sim.description}
							<div class="sim-desc">{sim.description}</div>
						{/if}
						<div class="sim-meta">
							目的変数: {sim.targetColumn} · R²={numberFmt.format(sim.r2)} · サンプル数{sim.sampleSize}件
						</div>
					</div>
					<div class="sim-actions">
						<a href="/simulators/{sim.id}" class="btn-secondary-sm">詳細</a>
						<button class="btn-danger-sm" onclick={() => deleteSimulator(sim.id, sim.name)}>削除</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.page {
		padding: 32px;
		max-width: 900px;
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
		.empty-sub { font-size: 0.875rem; }
	}

	.sim-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.sim-card {
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

	.sim-info { min-width: 0; }
	.sim-name { font-size: 0.9375rem; font-weight: 500; color: var(--color-text); }
	.sim-desc { font-size: 0.8125rem; color: var(--color-text-muted); margin-top: 2px; }
	.sim-meta { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px; }
	.sim-actions { display: flex; gap: 8px; flex-shrink: 0; }
</style>
