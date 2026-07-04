<script lang="ts">
	import { marked } from 'marked';
	import { filterXSS } from 'xss';
	import X from '$lib/components/icon/X.svelte';
	import Copy from '$lib/components/icon/Copy.svelte';
	import Download from '$lib/components/icon/Download.svelte';

	type Props = {
		open: boolean;
		loading: boolean;
		report: string | null;
		error: string | null;
		onClose: () => void;
	};

	let { open, loading, report, error, onClose }: Props = $props();

	let copied = $state(false);

	function renderMarkdown(text: string): string {
		return filterXSS(marked.parse(text, { async: false }) as string);
	}

	async function copyReport() {
		if (!report) return;
		await navigator.clipboard.writeText(report);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function printReport() {
		window.print();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
		<div class="modal report-print-area" role="dialog" aria-modal="true" aria-label="分析レポート">
			<div class="modal-header">
				<h2>分析レポート</h2>
				<button class="icon-btn" onclick={onClose} aria-label="閉じる">
					<X size={16} />
				</button>
			</div>

			<div class="modal-body">
				{#if loading}
					<div class="loading-state">
						<div class="spinner"></div>
						<p>レポートを作成しています…</p>
					</div>
				{:else if error}
					<p class="error-text">{error}</p>
				{:else if report}
					<div class="report-content">{@html renderMarkdown(report)}</div>
				{/if}
			</div>

			{#if report && !loading}
				<div class="modal-footer">
					<button class="action-btn" onclick={copyReport}>
						<Copy size={14} />
						{copied ? 'コピーしました' : 'コピー'}
					</button>
					<button class="action-btn" onclick={printReport}>
						<Download size={14} />
						印刷 / PDF保存
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style lang="scss">
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
	}

	.modal {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 640px;
		max-height: 85vh;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;

		h2 {
			font-size: 0.9375rem;
			font-weight: 600;
			color: var(--color-text);
			margin: 0;
		}
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-surface); }
	}

	.modal-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 20px 24px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 0;

		p {
			font-size: 0.8125rem;
			color: var(--color-text-muted);
			margin: 0;
		}
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error-text {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0;
	}

	.report-content {
		font-size: 0.875rem;
		line-height: 1.75;
		color: var(--color-text);

		:global(h1) {
			font-size: 1.125rem;
			font-weight: 700;
			margin: 0 0 0.6em;
		}
		:global(h2) {
			font-size: 0.9375rem;
			font-weight: 700;
			margin: 1.2em 0 0.5em;
			padding-top: 0.6em;
			border-top: 1px solid var(--color-border);

			&:first-child { border-top: none; padding-top: 0; margin-top: 0; }
		}
		:global(p) { margin: 0 0 0.8em; }
		:global(ul), :global(ol) {
			padding-left: 1.4em;
			margin: 0 0 0.8em;
		}
		:global(li) { margin-bottom: 0.3em; }
		:global(strong) { font-weight: 700; }
	}

	.modal-footer {
		display: flex;
		gap: 8px;
		padding: 12px 18px;
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 0.8125rem;
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	@media print {
		:global(body *) {
			visibility: hidden;
		}
		:global(.report-print-area),
		:global(.report-print-area *) {
			visibility: visible;
		}
		.overlay {
			position: static;
			background: none;
			padding: 0;
			display: block;
		}
		.report-print-area {
			max-width: none;
			max-height: none;
			box-shadow: none;
			border: none;
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
		}
		.modal-header,
		.modal-footer {
			display: none;
		}
	}
</style>
