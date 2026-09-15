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

	// --- Hyperdrive (auto-detection + toggle) ---
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
					hyperdriveError = body.error ?? 'Failed to enable';
					return;
				}
				hyperdriveItems = hyperdriveItems.map((i) =>
					i.bindingName === item.bindingName ? { ...i, connectionId: body.id!, enabled: true } : i
				);
			} else {
				if (!item.connectionId) return;
				const res = await fetch(`/api/db-connections/${item.connectionId}`, { method: 'DELETE' });
				if (!res.ok) {
					hyperdriveError = 'Failed to disable';
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

	// --- TCP Sockets (manual creation form) ---
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

	// When switching engines, if the port field is still at the other engine's default value, automatically update it to the current engine's default
	// (a port the user entered manually is never overwritten)
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
			password: item.config.password, // Masked value. If left unchanged, the server keeps the existing password
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
					tcpError = body.error ?? 'Failed to save';
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
					tcpError = body.error ?? 'Failed to save';
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
		if (!confirm('This will delete the connection. Data sources already imported will remain. Are you sure?')) return;
		await fetch(`/api/db-connections/${id}`, { method: 'DELETE' });
		tcpItems = tcpItems.filter((i) => i.id !== id);
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">Connection Management</h1>
	</div>

	<section class="section">
		<h2 class="section-title">Hyperdrive Bindings</h2>
		<p class="lead">
			Lists Hyperdrive bindings (external DB connections) registered in wrangler.toml. Enabling one lets you import that database's tables as data sources. Disabling one leaves already-imported data sources intact.
		</p>

		{#if hyperdriveError}<p class="form-error">{hyperdriveError}</p>{/if}

		{#if hyperdriveItems.length === 0}
			<p class="empty">
				No Hyperdrive bindings are available. Register a binding whose name starts with <code>HYPERDRIVE_</code> in wrangler.toml and deploy.
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
								<a href="/connections/{item.connectionId}" class="link-btn">Import Tables</a>
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
			<h2 class="section-title">Manual DB Connections (TCP)</h2>
			<button class="add-btn" onclick={openAddTcp}>+ Add Connection</button>
		</div>
		<p class="lead">
			Connect by entering the host, port, username, and password directly. No pre-registration in wrangler.toml is required, so it's ready to use immediately, but there's no connection pooling or caching like Hyperdrive provides.
		</p>

		{#if tcpItems.length === 0 && !showTcpForm}
			<p class="empty">No connections yet.</p>
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
						<a href="/connections/{item.id}" class="link-btn">Import Tables</a>
						<button class="link-btn" onclick={() => openEditTcp(item)}>Edit</button>
						<button class="link-btn danger" onclick={() => removeTcp(item.id)}>Delete</button>
					</div>
				</li>
			{/each}
		</ul>

		{#if showTcpForm}
			<div class="form-card">
				<h3>{editingTcpId ? 'Edit Connection' : 'Add Connection'}</h3>
				{#if tcpError}<p class="form-error">{tcpError}</p>{/if}
				<div class="fields">
					<Textbox label="Name" bind:value={tcpForm.name} placeholder="e.g., Customer DB (Production RDS)" required />
					<Textbox label="Description (optional)" bind:value={tcpForm.description} />
					<Select label="Engine" bind:value={tcpForm.engine} options={ENGINE_OPTIONS} />
					<div class="field-row">
						<Textbox label="Host" bind:value={tcpForm.host} placeholder="db.example.com" required />
						<Textbox label="Port" type="number" bind:value={tcpForm.port} required />
					</div>
					<Textbox label="Database Name" bind:value={tcpForm.database} required />
					<div class="field-row">
						<Textbox label="Username" bind:value={tcpForm.username} required />
						<Textbox label="Password" type="password" bind:value={tcpForm.password} required />
					</div>
					<Toggle bind:checked={tcpForm.ssl} label="Use SSL" />
				</div>
				<div class="form-actions">
					<button class="cancel-btn" onclick={cancelTcp}>Cancel</button>
					<button
						class="save-btn"
						onclick={saveTcp}
						disabled={tcpSaving || !tcpForm.name || !tcpForm.host || !tcpForm.database || !tcpForm.username || !tcpForm.password}
					>
						Save
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
