<script lang="ts">
	import { untrack } from 'svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const ENGINE_OPTIONS = [
		{ value: 'postgres', label: 'PostgreSQL' },
		{ value: 'mysql', label: 'MySQL' }
	];
	const ENGINE_LABEL: Record<string, string> = { postgres: 'PostgreSQL', mysql: 'MySQL' };
	const ENGINE_DEFAULT_PORT: Record<string, string> = { postgres: '5432', mysql: '3306' };

	// --- Hyperdrive（自動検出＋トグル） ---
	type HyperdriveItem = {
		bindingName: string;
		connectionId: string | null;
		name: string;
		enabled: boolean;
		engine: 'postgres' | 'mysql' | null;
	};

	let hyperdriveItems = $state<HyperdriveItem[]>(untrack(() => data.hyperdriveItems));
	let togglingBinding = $state<string | null>(null);
	let hyperdriveError = $state('');

	async function toggleHyperdrive(item: HyperdriveItem, enabled: boolean) {
		hyperdriveError = '';
		togglingBinding = item.bindingName;
		try {
			if (enabled) {
				const res = await fetch('/api/db-connections', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: item.bindingName,
						provider: 'hyperdrive',
						config: { bindingName: item.bindingName }
					})
				});
				const body = (await res.json()) as { id?: string; error?: string };
				if (!res.ok) {
					hyperdriveError = body.error ?? '有効化に失敗しました';
					return;
				}
				hyperdriveItems = hyperdriveItems.map((i) =>
					i.bindingName === item.bindingName ? { ...i, connectionId: body.id!, enabled: true } : i
				);
			} else {
				if (!item.connectionId) return;
				const res = await fetch(`/api/db-connections/${item.connectionId}`, { method: 'DELETE' });
				if (!res.ok) {
					hyperdriveError = '無効化に失敗しました';
					return;
				}
				hyperdriveItems = hyperdriveItems.map((i) =>
					i.bindingName === item.bindingName ? { ...i, connectionId: null, enabled: false } : i
				);
			}
		} finally {
			togglingBinding = null;
		}
	}

	// --- TCP Sockets（手動作成のフォーム） ---
	type TcpConnection = {
		id: string;
		name: string;
		description: string | null;
		config: {
			engine: 'postgres' | 'mysql';
			host: string;
			port: number;
			database: string;
			username: string;
			password: string;
			ssl: boolean;
		};
	};

	let tcpItems = $state<TcpConnection[]>(untrack(() => data.tcpItems));
	let showTcpForm = $state(false);
	let editingTcpId = $state<string | null>(null);
	let tcpSaving = $state(false);
	let tcpError = $state('');

	const emptyTcpForm = () => ({
		name: '',
		description: '',
		engine: 'postgres' as 'postgres' | 'mysql',
		host: '',
		port: '5432',
		database: '',
		username: '',
		password: '',
		ssl: true
	});

	let tcpForm = $state(emptyTcpForm());
	let lastEngine = 'postgres';

	// エンジン切り替え時、ポート欄がまだ相手側のデフォルト値のままなら自動的に今のエンジンのデフォルトへ更新する
	// （ユーザーが手動で入力したポートは上書きしない）
	$effect(() => {
		const engine = tcpForm.engine;
		if (engine !== lastEngine) {
			if (tcpForm.port === ENGINE_DEFAULT_PORT[lastEngine] || tcpForm.port === '') {
				tcpForm.port = ENGINE_DEFAULT_PORT[engine];
			}
			lastEngine = engine;
		}
	});

	function openAddTcp() {
		editingTcpId = null;
		tcpForm = emptyTcpForm();
		lastEngine = 'postgres';
		tcpError = '';
		showTcpForm = true;
	}

	function openEditTcp(item: TcpConnection) {
		editingTcpId = item.id;
		tcpForm = {
			name: item.name,
			description: item.description ?? '',
			engine: item.config.engine,
			host: item.config.host,
			port: String(item.config.port),
			database: item.config.database,
			username: item.config.username,
			password: item.config.password, // マスク済み値。変更しなければサーバー側で既存パスワードを保持する
			ssl: item.config.ssl
		};
		lastEngine = item.config.engine;
		tcpError = '';
		showTcpForm = true;
	}

	function cancelTcp() {
		showTcpForm = false;
	}

	async function saveTcp() {
		tcpSaving = true;
		tcpError = '';
		try {
			const config = {
				engine: tcpForm.engine,
				host: tcpForm.host,
				port: Number(tcpForm.port),
				database: tcpForm.database,
				username: tcpForm.username,
				password: tcpForm.password,
				ssl: tcpForm.ssl
			};
			if (editingTcpId) {
				const res = await fetch(`/api/db-connections/${editingTcpId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: tcpForm.name, description: tcpForm.description || undefined, config })
				});
				const body = (await res.json()) as TcpConnection & { error?: string };
				if (!res.ok) {
					tcpError = body.error ?? '保存に失敗しました';
					return;
				}
				tcpItems = tcpItems.map((i) => (i.id === editingTcpId ? body : i));
			} else {
				const res = await fetch('/api/db-connections', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: tcpForm.name,
						description: tcpForm.description || undefined,
						provider: 'tcp_socket',
						config
					})
				});
				const body = (await res.json()) as TcpConnection & { error?: string };
				if (!res.ok) {
					tcpError = body.error ?? '保存に失敗しました';
					return;
				}
				tcpItems = [...tcpItems, body];
			}
			showTcpForm = false;
		} finally {
			tcpSaving = false;
		}
	}

	async function removeTcp(id: string) {
		if (!confirm('この接続を削除します。取り込み済みのデータソースは残ります。よろしいですか？')) return;
		await fetch(`/api/db-connections/${id}`, { method: 'DELETE' });
		tcpItems = tcpItems.filter((i) => i.id !== id);
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">接続管理</h1>
	</div>

	<section class="section">
		<h2 class="section-title">Hyperdriveバインディング</h2>
		<p class="lead">
			wrangler.tomlに登録済みのHyperdriveバインディング（外部DB接続）を一覧表示します。有効にすると、そのDBのテーブルをデータソースとして取り込めるようになります。無効にしても、既に取り込み済みのデータソースは残ります。
		</p>

		{#if hyperdriveError}<p class="form-error">{hyperdriveError}</p>{/if}

		{#if hyperdriveItems.length === 0}
			<p class="empty">
				利用可能なHyperdriveバインディングがありません。wrangler.tomlに<code>HYPERDRIVE_</code>で始まる名前のバインディングを登録し、デプロイしてください。
			</p>
		{:else}
			<ul class="list">
				{#each hyperdriveItems as item (item.bindingName)}
					<li class="item">
						<div class="item-info">
							<span class="item-name">{item.name}</span>
							<span class="item-url">{item.bindingName}</span>
						</div>
						<div class="item-meta">
							<span class="badge">Hyperdrive</span>
							{#if item.engine}<span class="badge engine">{ENGINE_LABEL[item.engine]}</span>{/if}
							{#if item.enabled && item.connectionId}
								<a href="/connections/{item.connectionId}" class="link-btn">テーブルを取り込む</a>
							{/if}
							<Toggle
								checked={item.enabled}
								disabled={togglingBinding === item.bindingName}
								onchange={(checked) => toggleHyperdrive(item, checked)}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="section">
		<div class="section-header">
			<h2 class="section-title">手動DB接続（TCP）</h2>
			<button class="add-btn" onclick={openAddTcp}>+ 接続を追加</button>
		</div>
		<p class="lead">
			ホスト・ポート・ユーザー名・パスワードを直接入力して接続します。wrangler.tomlの事前登録は不要ですぐ使えますが、Hyperdriveのようなコネクションプーリング・キャッシュはありません。
		</p>

		{#if tcpItems.length === 0 && !showTcpForm}
			<p class="empty">接続がまだありません。</p>
		{/if}

		<ul class="list">
			{#each tcpItems as item (item.id)}
				<li class="item">
					<div class="item-info">
						<span class="item-name">{item.name}</span>
						<span class="item-url">{item.config.username}@{item.config.host}:{item.config.port}/{item.config.database}</span>
						{#if item.description}
							<span class="item-desc">{item.description}</span>
						{/if}
					</div>
					<div class="item-meta">
						<span class="badge">TCP Sockets</span>
						<span class="badge engine">{ENGINE_LABEL[item.config.engine]}</span>
						<a href="/connections/{item.id}" class="link-btn">テーブルを取り込む</a>
						<button class="link-btn" onclick={() => openEditTcp(item)}>編集</button>
						<button class="link-btn danger" onclick={() => removeTcp(item.id)}>削除</button>
					</div>
				</li>
			{/each}
		</ul>

		{#if showTcpForm}
			<div class="form-card">
				<h3>{editingTcpId ? '接続を編集' : '接続を追加'}</h3>
				{#if tcpError}<p class="form-error">{tcpError}</p>{/if}
				<div class="fields">
					<Textbox label="名前" bind:value={tcpForm.name} placeholder="例: 顧客DB（本番RDS）" required />
					<Textbox label="説明（任意）" bind:value={tcpForm.description} />
					<Select label="エンジン" bind:value={tcpForm.engine} options={ENGINE_OPTIONS} />
					<div class="field-row">
						<Textbox label="ホスト" bind:value={tcpForm.host} placeholder="db.example.com" required />
						<Textbox label="ポート" type="number" bind:value={tcpForm.port} required />
					</div>
					<Textbox label="データベース名" bind:value={tcpForm.database} required />
					<div class="field-row">
						<Textbox label="ユーザー名" bind:value={tcpForm.username} required />
						<Textbox label="パスワード" type="password" bind:value={tcpForm.password} required />
					</div>
					<Toggle bind:checked={tcpForm.ssl} label="SSLを使う" />
				</div>
				<div class="form-actions">
					<button class="cancel-btn" onclick={cancelTcp}>キャンセル</button>
					<button
						class="save-btn"
						onclick={saveTcp}
						disabled={tcpSaving || !tcpForm.name || !tcpForm.host || !tcpForm.database || !tcpForm.username || !tcpForm.password}
					>
						保存
					</button>
				</div>
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.page {
		padding: 28px 32px;
		width: 100%;
		max-width: var(--body-width-md);
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.section {
		margin-bottom: 36px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 4px;
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 4px;
	}

	.lead {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 8px 0 16px;
	}

	.add-btn {
		flex-shrink: 0;
		padding: 6px 14px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.8125rem;
		cursor: pointer;

		&:hover { opacity: 0.85; }
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0 0 12px;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin: 24px 0;
		text-align: center;

		code {
			background: var(--color-border);
			padding: 1px 5px;
			border-radius: 4px;
		}
	}

	.list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 16px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
	}

	.item-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.item-name {
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.item-url {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		font-family: ui-monospace, monospace;
	}

	.item-desc {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.badge {
		font-size: 0.75rem;
		padding: 2px 8px;
		border-radius: 4px;
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	.badge.engine {
		background: var(--color-info-bg);
		color: var(--color-info);
	}

	.link-btn {
		background: none;
		border: none;
		font-size: 0.875rem;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0;
		text-decoration: none;
	}

	.link-btn:hover { color: var(--color-text); }
	.link-btn.danger:hover { color: var(--color-error); }

	.form-card {
		margin-top: 16px;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 20px;
		background: var(--color-surface);
	}

	h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		margin: 0 0 16px;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-bottom: 20px;
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	.cancel-btn {
		padding: 8px 16px;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.875rem;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.cancel-btn:hover { border-color: var(--color-text-muted); }

	.save-btn {
		padding: 8px 20px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.save-btn:not(:disabled):hover { opacity: 0.85; }
</style>
