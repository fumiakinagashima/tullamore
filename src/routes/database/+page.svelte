<script lang="ts">
	import type { PageData } from './$types';
	import Database from '$lib/components/icon/Database.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="empty-state">
	<Database size={32} />
	{#if data.sources.length === 0}
		<p>テーブルがありません</p>
		<p class="empty-sub">左の「+」から新しいテーブルを作成してください。</p>
	{:else}
		<p>テーブルを選択してください</p>
		<p class="empty-sub">左の一覧からテーブルを選ぶと、スキーマとデータを表示します。SQLで直接問い合わせることもできます。</p>
	{/if}
</div>

<style lang="scss">
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 100%;
		color: var(--color-text-muted);

		p { margin: 0; }
		.empty-sub { font-size: 0.8125rem; }
	}
</style>
