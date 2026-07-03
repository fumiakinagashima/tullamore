<script lang="ts">
	import { tick } from 'svelte';
	import ArrowUp from '$lib/components/icon/ArrowUp.svelte';
	import { marked } from 'marked';
	import { filterXSS } from 'xss';

	type SourceInfo = { id: string; name: string; columns: { key: string; label: string; type: string }[] };
	type ChatMessage = { role: 'user' | 'assistant'; text: string };

	type Props = {
		analysisType: 'regression' | 'trend' | 'sensitivity' | 'scenario' | 'goal-seek' | null;
		sources: SourceInfo[];
		config: Record<string, unknown>;
		resultSummary?: Record<string, unknown> | null;
		onApplyConfig: (config: Record<string, unknown>) => void;
	};

	let { analysisType, sources, config, resultSummary = null, onApplyConfig }: Props = $props();

	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let loading = $state(false);
	let listEl = $state<HTMLElement | null>(null);

	$effect(() => {
		void messages.length;
		tick().then(() => {
			if (listEl) listEl.scrollTop = listEl.scrollHeight;
		});
	});

	function renderMarkdown(text: string): string {
		return filterXSS(marked.parse(text, { async: false }) as string);
	}

	async function send() {
		const text = input.trim();
		if (!text || loading) return;
		input = '';
		messages = [...messages, { role: 'user', text }];
		loading = true;

		let assistantText = '';
		messages = [...messages, { role: 'assistant', text: '' }];

		try {
			const res = await fetch('/api/analysis-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: text,
					analysisType,
					sources,
					config,
					resultSummary,
					history: messages.slice(0, -2)
				})
			});

			if (!res.ok || !res.body) {
				messages = [...messages.slice(0, -1), { role: 'assistant', text: 'エラーが発生しました。' }];
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const parts = buf.split('\n\n');
				buf = parts.pop() ?? '';
				for (const part of parts) {
					if (!part.startsWith('data: ')) continue;
					try {
						const event = JSON.parse(part.slice(6)) as {
							type: string;
							text?: string;
							config?: Record<string, unknown>;
						};
						if (event.type === 'delta' && event.text) {
							assistantText += event.text;
							messages = [...messages.slice(0, -1), { role: 'assistant', text: assistantText }];
						} else if (event.type === 'config' && event.config) {
							onApplyConfig(event.config);
						}
					} catch {
						// ignore parse error
					}
				}
			}
		} finally {
			loading = false;
		}
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		}
	}

	const EMPTY_HINTS: Record<Exclude<Props['analysisType'], null>, string> = {
		regression: '「広告費と来店数が売上に与える影響を見たい」のように伝えると設定します。使い方や結果の見方の質問もどうぞ。',
		trend: '「売上の推移を1年後まで予測して」のように伝えると設定します。使い方や結果の見方の質問もどうぞ。',
		sensitivity: '「売上にどの変数が一番効いているか見たい」のように伝えると設定します。使い方や結果の見方の質問もどうぞ。',
		scenario: '「広告費と来店数で売上を比較したい」のように伝えると設定します。シナリオの値はグリッドで編集してください。',
		'goal-seek': '「売上を目標値にするには広告費をいくらにすればいいか」のように伝えると設定します。使い方の質問もどうぞ。'
	};

	const emptyHint = $derived(analysisType ? EMPTY_HINTS[analysisType] : 'どの分析を試したいですか？サイドバーから選ぶか、内容を伝えてください。');
</script>

<div class="assistant">
	<div class="assistant-header">AI アシスタント</div>
	<div class="assistant-messages" bind:this={listEl}>
		{#if messages.length === 0}
			<p class="assistant-empty">{emptyHint}</p>
		{/if}
		{#each messages as msg}
			<div class="assistant-msg {msg.role}">
				{#if msg.role === 'assistant'}
					{#if msg.text}
						<div class="msg-text">{@html renderMarkdown(msg.text)}</div>
					{:else}
						<div class="typing-dots"><span></span><span></span><span></span></div>
					{/if}
				{:else}
					<div class="msg-text">{msg.text}</div>
				{/if}
			</div>
		{/each}
	</div>
	<div class="assistant-input-row">
		<textarea
			bind:value={input}
			onkeydown={handleKey}
			placeholder="分析したい内容や質問をどうぞ..."
			rows="2"
			disabled={loading}
		></textarea>
		<button class="assistant-send" onclick={send} disabled={loading || !input.trim()} aria-label="送信">
			<ArrowUp size={14} />
		</button>
	</div>
</div>

<style lang="scss">
	.assistant {
		/* 幅は親（+layout.svelte のドラッグでリサイズ可能な .analysis-sidebar）が決める */
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.assistant-header {
		padding: 14px 14px 10px;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.assistant-messages {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.assistant-empty {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
		line-height: 1.6;
	}

	.assistant-msg {
		display: flex;
		flex-direction: column;

		&.user {
			align-items: flex-end;

			.msg-text {
				background: var(--color-surface);
				border: 1px solid var(--color-border);
				border-radius: 12px;
				border-bottom-right-radius: 3px;
				padding: 7px 12px;
				font-size: 0.8125rem;
				max-width: 90%;
				word-break: break-word;
				white-space: pre-wrap;
			}
		}

		&.assistant {
			align-items: flex-start;

			.msg-text {
				font-size: 0.8125rem;
				line-height: 1.65;
				color: var(--color-text);

				:global(p) {
					margin: 0 0 0.4em;
					&:last-child { margin-bottom: 0; }
				}
				:global(ul), :global(ol) {
					padding-left: 1.2em;
					margin: 0.2em 0;
				}
				:global(code) {
					font-size: 0.85em;
					background: var(--color-border);
					padding: 0.1em 0.3em;
					border-radius: 3px;
				}
			}
		}
	}

	.typing-dots {
		display: flex;
		gap: 4px;
		padding: 6px 0;

		span {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--color-text-muted);
			animation: bounce 1.2s infinite;

			&:nth-child(2) { animation-delay: 0.2s; }
			&:nth-child(3) { animation-delay: 0.4s; }
		}
	}

	.assistant-input-row {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		padding: 10px 14px;
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;

		textarea {
			flex: 1;
			resize: none;
			border: 1px solid var(--color-border);
			border-radius: 10px;
			padding: 7px 10px;
			font-size: 0.8125rem;
			font-family: inherit;
			line-height: 1.5;
			background: var(--color-background);
			color: var(--color-text);
			outline: none;
			transition: border-color 0.15s;
			max-height: 100px;
			overflow-y: auto;

			&:focus { border-color: var(--color-primary); }
			&::placeholder { color: var(--color-text-muted); }
			&:disabled { opacity: 0.5; }
		}
	}

	.assistant-send {
		flex-shrink: 0;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: none;
		background: var(--color-primary);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: opacity 0.15s;
		margin-bottom: 1px;

		&:disabled { opacity: 0.35; cursor: not-allowed; }
		&:not(:disabled):hover { opacity: 0.85; }
	}

	@keyframes bounce {
		0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
		40% { transform: scale(1); opacity: 1; }
	}
</style>
