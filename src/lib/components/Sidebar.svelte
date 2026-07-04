<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';
	import { notificationCenter } from '$lib/stores/notifications.svelte';
	import { chatSession } from '$lib/stores/chat-session.svelte';
	import NotificationDrawer from '$lib/components/ui/NotificationDrawer.svelte';
	import Plus from '$lib/components/icon/Plus.svelte';
	import Bell from '$lib/components/icon/Bell.svelte';
	import Database from '$lib/components/icon/Database.svelte';
	import Plug from '$lib/components/icon/Plug.svelte';
	import Scatter from '$lib/components/icon/Scatter.svelte';
	import TrendingUp from '$lib/components/icon/TrendingUp.svelte';
	import Tornado from '$lib/components/icon/Tornado.svelte';
	import Compare from '$lib/components/icon/Compare.svelte';
	import Target from '$lib/components/icon/Target.svelte';
	import Dice from '$lib/components/icon/Dice.svelte';
	import Coins from '$lib/components/icon/Coins.svelte';
	import Grid from '$lib/components/icon/Grid.svelte';
	import Sigma from '$lib/components/icon/Sigma.svelte';
	import Flask from '$lib/components/icon/Flask.svelte';
	import Split from '$lib/components/icon/Split.svelte';
	import Layers from '$lib/components/icon/Layers.svelte';
	import Flag from '$lib/components/icon/Flag.svelte';
	import Users from '$lib/components/icon/Users.svelte';
	import Settings from '$lib/components/icon/Settings.svelte';
	import LogOut from '$lib/components/icon/LogOut.svelte';
	import type { AccountRow } from '$lib/server/db/account-service';

	type Props = { account: AccountRow };
	let { account }: Props = $props();

	const workModules = [
		{ href: '/composite-report', label: '複合分析レポート', icon: Layers },
		{ href: '/kpi', label: 'KPI管理', icon: Flag }
	];

	const analysisModules = [
		{ href: '/analysis/descriptive-stats', label: '記述統計', icon: Sigma },
		{ href: '/analysis/correlation', label: '相関分析', icon: Grid },
		{ href: '/analysis/ab-test', label: 'A/Bテスト', icon: Flask },
		{ href: '/analysis/regression', label: '回帰分析', icon: Scatter },
		{ href: '/analysis/classification', label: 'ロジスティック回帰', icon: Split },
		{ href: '/analysis/sensitivity', label: '感度分析', icon: Tornado },
		{ href: '/analysis/scenario', label: 'シナリオ比較', icon: Compare },
		{ href: '/analysis/goal-seek', label: 'ゴールシーク', icon: Target },
		{ href: '/analysis/trend', label: 'トレンド予測', icon: TrendingUp },
		{ href: '/analysis/monte-carlo', label: 'モンテカルロ', icon: Dice },
		{ href: '/analysis/budget-allocation', label: '予算配分最適化', icon: Coins }
	];

	const dataSourceModules = $derived(
		[
			{ href: '/database', label: 'データベース管理', icon: Database, adminOnly: false },
			{ href: '/connections', label: '接続管理', icon: Plug, adminOnly: true }
		].filter((mod) => !mod.adminOnly || account.permission === 'admin')
	);

	let notificationDrawerOpen = $state(false);

	function toggleNotificationDrawer() {
		notificationDrawerOpen = !notificationDrawerOpen;
		if (notificationDrawerOpen) notificationCenter.loadItems();
	}

	function formatBadgeCount(count: number): string {
		return count > 99 ? '99+' : String(count);
	}

	async function handleSignout() {
		if (!confirm(m.signout_confirm())) return;
		await fetch('/api/auth/signout', { method: 'POST' });
		window.location.href = '/signin';
	}
</script>

<aside class="sidebar">
	<div class="sidebar-header">
		<span class="logo">TULLAMORE</span>
	</div>

	<a href="/" class="new-chat-row" onclick={() => chatSession.startNew()}>
		<Plus size={14} />
		{m.new_chat()}
	</a>

	<nav class="history">
		<p class="group-label">業務</p>
		{#each workModules as mod (mod.href)}
			<a href={mod.href} class="analysis-link" class:active={page.url.pathname === mod.href}>
				<mod.icon size={14} />
				{mod.label}
			</a>
		{/each}
		
		<p class="group-label">分析</p>
		{#each analysisModules as mod (mod.href)}
			<a href={mod.href} class="analysis-link" class:active={page.url.pathname === mod.href}>
				<mod.icon size={14} />
				{mod.label}
			</a>
		{/each}

		<p class="group-label">データソース</p>
		{#each dataSourceModules as mod (mod.href)}
			<a href={mod.href} class="analysis-link" class:active={page.url.pathname.startsWith(mod.href)}>
				<mod.icon size={14} />
				{mod.label}
			</a>
		{/each}
	</nav>

	<div class="sidebar-footer">
		<button class="settings-row notification-toggle" onclick={toggleNotificationDrawer}>
			<Bell size={15} />
			{m.notifications()}
			{#if notificationCenter.unreadCount > 0}
				<span class="notification-badge">{formatBadgeCount(notificationCenter.unreadCount)}</span>
			{/if}
		</button>

		{#if account.permission === 'admin'}
			<a href="/database/accounts" class="settings-row">
				<Users size={15} />
				アカウント
			</a>
		{/if}

		<a href="/settings" class="settings-row">
			<Settings size={15} />
			{m.settings()}
		</a>

		<div class="account-row">
			<span class="account-name">{account.name}</span>
			<button class="signout-btn" onclick={handleSignout} title={m.signout()} aria-label={m.signout()}>
				<LogOut size={15} />
			</button>
		</div>
	</div>
</aside>

<NotificationDrawer open={notificationDrawerOpen} onclose={() => (notificationDrawerOpen = false)} />

<style lang="scss">
	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--sidebar-bg);
		overflow: hidden;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 12px 10px;
	}

	.logo {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-primary);
		padding: 0 4px;
		letter-spacing: -0.01em;
		font-family: Georgia, 'Times New Roman', Times, serif;
	}

	.new-chat-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 8px 4px;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--sidebar-text);
		text-decoration: none;
		transition: background 0.15s;

		&:hover { background: var(--sidebar-hover); }
	}

	.history {
		flex: 1;
		overflow-y: auto;
		padding: 4px 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.group-label {
		font-size: 0.75rem;
		color: var(--sidebar-text-muted);
		padding: 8px 10px 4px;
		font-weight: 500;
	}

	.analysis-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--sidebar-text);
		text-decoration: none;
		transition: background 0.15s, color 0.15s;

		&:hover { background: var(--sidebar-hover); }

		&.active {
			background: color-mix(in srgb, var(--color-primary) 12%, transparent);
			color: var(--color-primary);
			font-weight: 500;
		}
	}

	.sidebar-footer {
		padding: 8px;
		border-top: 1px solid var(--sidebar-border);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.settings-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--sidebar-text-muted);
		text-decoration: none;
		transition: background 0.15s, color 0.15s;

		&:hover {
			background: var(--sidebar-hover);
			color: var(--sidebar-text);
		}
	}

	button.settings-row {
		width: 100%;
		border: none;
		background: transparent;
		font: inherit;
		text-align: left;
		cursor: pointer;
		font-size: 0.87rem;
	}

	.notification-badge {
		margin-left: auto;
		min-width: 18px;
		padding: 1px 5px;
		border-radius: 999px;
		background: var(--color-primary);
		color: #fff;
		font-size: 0.6875rem;
		font-weight: 700;
		line-height: 1.4;
		text-align: center;
	}

	.account-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		margin-top: 4px;
		border-top: 1px solid var(--sidebar-border);
	}

	.account-name {
		flex: 1;
		min-width: 0;
		font-size: 0.8125rem;
		color: var(--sidebar-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.signout-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--sidebar-text-muted);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;

		&:hover {
			background: var(--sidebar-hover);
			color: var(--sidebar-text);
		}
	}
</style>
