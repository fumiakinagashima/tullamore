<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { notificationCenter } from '$lib/stores/notifications.svelte';
	import { chatSession } from '$lib/stores/chat-session.svelte';
	import { chatHistory, type ChatSummary } from '$lib/stores/chat-history.svelte';
	import NotificationDrawer from '$lib/components/ui/NotificationDrawer.svelte';
	import Dashboard from '$lib/components/icon/Dashboard.svelte';
	import Bell from '$lib/components/icon/Bell.svelte';
	import Database from '$lib/components/icon/Database.svelte';
	import Plug from '$lib/components/icon/Plug.svelte';
	import MessageCircle from '$lib/components/icon/MessageCircle.svelte';
	import MoreVertical from '$lib/components/icon/MoreVertical.svelte';
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
	import ChevronDown from '$lib/components/icon/ChevronDown.svelte';
	import type { AccountRow } from '$lib/server/db/account-service';

	type Props = { account: AccountRow };
	let { account }: Props = $props();

	const workModules = [
		{ href: '/report-create', label: 'レポート作成', icon: Layers },
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

	type GroupKey = 'works' | 'analysis' | 'data-source' | 'chat';
	const COLLAPSE_STORAGE_KEY = 'tullamore_sidebar_collapsed';

	function loadCollapsedGroups(): Record<string, boolean> {
		if (typeof localStorage === 'undefined') return {};
		try {
			return JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? '{}');
		} catch {
			return {};
		}
	}

	let collapsedGroups = $state<Record<string, boolean>>(loadCollapsedGroups());

	function toggleGroup(key: GroupKey) {
		collapsedGroups = { ...collapsedGroups, [key]: !collapsedGroups[key] };
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedGroups));
		}
	}

	let openMenuId = $state<string | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');

	function toggleHistoryMenu(id: string) {
		openMenuId = openMenuId === id ? null : id;
	}

	function startRename(item: ChatSummary) {
		renamingId = item.id;
		renameValue = item.title;
		openMenuId = null;
	}

	async function commitRename(id: string) {
		if (renamingId !== id) return;
		renamingId = null;
		const title = renameValue.trim();
		const current = chatHistory.items.find((c) => c.id === id);
		if (!title || !current || title === current.title) return;
		chatHistory.updateTitle(id, title);
		try {
			await fetch(`/api/chats/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title })
			});
		} catch {
			// 失敗時もUI上は変更後のタイトルを維持する
		}
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			renamingId = null;
		}
	}

	async function deleteChatItem(item: ChatSummary) {
		openMenuId = null;
		if (!confirm(m.history_delete_confirm())) return;
		chatHistory.remove(item.id);
		if (page.url.searchParams.get('id') === item.id) goto('/chat');
		try {
			await fetch(`/api/chats/${item.id}`, { method: 'DELETE' });
		} catch {
			// ローカル一覧からは削除済み。失敗時はリロードで復活する
		}
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	$effect(() => {
		if (!openMenuId) return;
		const close = () => (openMenuId = null);
		const id = setTimeout(() => document.addEventListener('click', close), 0);
		return () => {
			clearTimeout(id);
			document.removeEventListener('click', close);
		};
	});
</script>

<aside class="sidebar">
	<div class="sidebar-header">
		<span class="logo">TULLAMORE</span>
	</div>

	<a href="/" class="portal" class:active={page.url.pathname === '/'}>
		<Dashboard size={14} />
		ポータル
	</a>

	<nav class="history">
		<button class="group-label" onclick={() => toggleGroup('works')} aria-expanded={!collapsedGroups.works}>
			<span class="group-chevron" class:collapsed={collapsedGroups.works}><ChevronDown size={12} /></span>
			業務
		</button>
		{#if !collapsedGroups.works}
			{#each workModules as mod (mod.href)}
				<a href={mod.href} class="analysis-link" class:active={page.url.pathname === mod.href}>
					<mod.icon size={14} />
					{mod.label}
				</a>
			{/each}
		{/if}

		<button class="group-label" onclick={() => toggleGroup('analysis')} aria-expanded={!collapsedGroups.analysis}>
			<span class="group-chevron" class:collapsed={collapsedGroups.analysis}><ChevronDown size={12} /></span>
			分析
		</button>
		{#if !collapsedGroups.analysis}
			{#each analysisModules as mod (mod.href)}
				<a href={mod.href} class="analysis-link" class:active={page.url.pathname === mod.href}>
					<mod.icon size={14} />
					{mod.label}
				</a>
			{/each}
		{/if}

		<button class="group-label" onclick={() => toggleGroup('data-source')} aria-expanded={!collapsedGroups['data-source']}>
			<span class="group-chevron" class:collapsed={collapsedGroups['data-source']}><ChevronDown size={12} /></span>
			データソース
		</button>
		{#if !collapsedGroups['data-source']}
			{#each dataSourceModules as mod (mod.href)}
				<a href={mod.href} class="analysis-link" class:active={page.url.pathname.startsWith(mod.href)}>
					<mod.icon size={14} />
					{mod.label}
				</a>
			{/each}
		{/if}

		<button class="group-label" onclick={() => toggleGroup('chat')} aria-expanded={!collapsedGroups.chat}>
			<span class="group-chevron" class:collapsed={collapsedGroups.chat}><ChevronDown size={12} /></span>
			チャット
		</button>
		{#if !collapsedGroups.chat}
			<a href="/chat" class="new-chat-row" onclick={() => chatSession.startNew()}>
				<MessageCircle size={14} />
				{m.new_chat()}
			</a>

			{#each chatHistory.items as item (item.id)}
				<div class="history-item-row" class:active={page.url.searchParams.get('id') === item.id}>
					{#if renamingId === item.id}
						<input
							class="history-rename-input"
							bind:value={renameValue}
							onkeydown={handleRenameKeydown}
							onblur={() => commitRename(item.id)}
							use:focusOnMount
						/>
					{:else}
						<a href="/chat?id={item.id}" class="history-item">
							{item.title || m.new_chat()}
						</a>
					{/if}
					<div class="history-menu-wrap">
						<button
							class="history-menu-btn"
							aria-label={m.history_menu()}
							aria-expanded={openMenuId === item.id}
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								toggleHistoryMenu(item.id);
							}}
						>
							<MoreVertical size={14} />
						</button>
						{#if openMenuId === item.id}
							<div class="history-menu">
								<button class="history-menu-item" onclick={() => startRename(item)}>
									{m.history_rename()}
								</button>
								<button class="history-menu-item danger" onclick={() => deleteChatItem(item)}>
									{m.history_delete()}
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
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

	.portal {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 8px 4px;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: var(--font-size-xs);
		color: var(--sidebar-text);
		text-decoration: none;
		transition: background 0.15s;

		&:hover { background: var(--sidebar-hover); }
		&.active {
			background: color-mix(in srgb, var(--color-primary) 12%, transparent);
			color: var(--color-primary);
			font-weight: 500;
		}
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
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		border: none;
		background: transparent;
		font: inherit;
		font-size: 0.75rem;
		color: var(--sidebar-text-muted);
		padding: 8px 10px 4px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		margin-top: 8px;
	}

	.group-chevron {
		display: inline-flex;
		flex-shrink: 0;
		transition: transform 0.15s ease;

		&.collapsed { transform: rotate(-90deg); }
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

	.new-chat-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--sidebar-text);
		text-decoration: none;
		transition: background 0.15s;

		&:hover { background: var(--sidebar-hover); }
	}

	.history-item-row {
		position: relative;
		display: flex;
		align-items: center;
		border-radius: 8px;
		transition: background 0.15s;

		&:hover,
		&.active { background: var(--sidebar-hover); }

		&.active .history-item { color: var(--color-text); }
	}

	.history-item {
		flex: 1;
		min-width: 0;
		display: block;
		padding: 7px 10px;
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--sidebar-text);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.history-rename-input {
		flex: 1;
		min-width: 0;
		padding: 6px 9px;
		margin: 1px 0;
		border: 1px solid var(--color-primary);
		border-radius: 8px;
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.875rem;
		font-family: inherit;
		outline: none;
	}

	.history-menu-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.history-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		margin-right: 4px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--sidebar-text-muted);
		cursor: pointer;
		transition: background 0.1s ease, color 0.1s ease;

		&:hover,
		&[aria-expanded='true'] {
			background: var(--color-border);
			color: var(--sidebar-text);
		}
	}

	.history-menu {
		position: absolute;
		top: calc(100% + 2px);
		right: 0;
		min-width: 140px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.08),
			0 1px 4px rgba(0, 0, 0, 0.04);
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		z-index: 20;
	}

	.history-menu-item {
		display: block;
		width: 100%;
		padding: 7px 10px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-text);
		font-size: 0.8125rem;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;

		&:hover { background: var(--color-background); }
		&.danger { color: var(--color-danger); }
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
