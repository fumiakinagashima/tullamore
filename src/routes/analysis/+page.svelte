<script lang="ts">
	import Scatter from '$lib/components/icon/Scatter.svelte';
	import TrendingUp from '$lib/components/icon/TrendingUp.svelte';

	const modules = [
		{
			href: '/analysis/regression',
			label: '回帰分析',
			desc: '説明変数を動かすと目的変数がどう変化するかをシミュレーションします。「広告費を増やしたら売上はどうなるか」のような、ドライバーの影響度を調べたいときに使います。',
			icon: Scatter
		},
		{
			href: '/analysis/trend',
			label: 'トレンド予測',
			desc: '時系列データから将来の推移を線で予測します。「半年後・1年後・5年後の見込み」のような、時間の経過に沿った推移を見たいときに使います。',
			icon: TrendingUp
		}
	];
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">分析</h1>
		<p class="page-sub">目的に合わせて分析手法を選択してください</p>
	</div>

	<div class="module-cards">
		{#each modules as mod (mod.href)}
			<a href={mod.href} class="module-card">
				<div class="module-card-icon"><mod.icon size={20} /></div>
				<p class="module-card-title">{mod.label}</p>
				<p class="module-card-desc">{mod.desc}</p>
			</a>
		{/each}
	</div>
</div>

<style lang="scss">
	.page {
		padding: 24px 32px;
	}

	.page-header {
		margin-bottom: 20px;
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 4px;
	}

	.page-sub {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.module-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 14px;
		max-width: 760px;
	}

	.module-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		text-decoration: none;
		transition: border-color 0.15s, box-shadow 0.15s;

		&:hover {
			border-color: var(--color-primary);
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		}
	}

	.module-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
	}

	.module-card-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.module-card-desc {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}
</style>
