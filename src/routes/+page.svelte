<script lang="ts">
	import Table from '$lib/components/chat/Table.svelte';
	import Chart from '$lib/components/chat/Chart.svelte';
	import ActionSelector from '$lib/components/chat/ActionSelector.svelte';
	import Values from '$lib/components/chat/Values.svelte';
	import Link from '$lib/components/chat/Link.svelte';
	import FormButton from '$lib/components/chat/FormButton.svelte';
	import Reply from '$lib/components/chat/Reply.svelte';
	import Simulator from '$lib/components/chat/Simulator.svelte';
	import FormDialog from '$lib/components/dialog/FormDialog.svelte';
	import TurnHistoryDrawer from '$lib/components/chat/TurnHistoryDrawer.svelte';
	import TypingIndicator from '$lib/components/ui/TypingIndicator.svelte';
	import type { Message, MessageContent, FormContent, ActionItem, ValuesContent, ChartContent, LinkContent, ReplyContent, SimulatorContent } from '$lib/types/chat';
	import type { StreamEvent } from '$lib/server/ai/stream';
	import * as m from '$lib/paraglide/messages.js';
	import { tick, untrack } from 'svelte';
	import { marked } from 'marked';
	import { filterXSS } from 'xss';
	import { toast } from '$lib/stores/toast.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { chatSession } from '$lib/stores/chat-session.svelte';
	import { chatHistory } from '$lib/stores/chat-history.svelte';
	import ArrowUp from '$lib/components/icon/ArrowUp.svelte';
	import Clock from '$lib/components/icon/Clock.svelte';
	import { CHAT_TITLE_MAX_LENGTH, CHAT_TEXTAREA_MAX_HEIGHT_PX } from '$lib/constants';

	function renderMarkdown(text: string): string {
		return filterXSS(marked.parse(text, { async: false }) as string);
	}

	const ls = (key: string, def: string) =>
		typeof localStorage !== 'undefined' ? (localStorage.getItem(key) ?? def) : def;

	let { data } = $props();

	function seedMessageFromNotification(seed: { id: string; seedContent: MessageContent[] } | null): Message[] {
		if (!seed) return [];
		return [{ id: crypto.randomUUID(), role: 'assistant', contents: seed.seedContent, createdAt: new Date() }];
	}

	function seedMessagesFromChat(seed: { id: string; messages: { id: string; role: 'user' | 'assistant'; contents: MessageContent[]; createdAt: Date }[] } | null): Message[] {
		if (!seed) return [];
		return seed.messages.map((msg) => ({ id: msg.id, role: msg.role, contents: msg.contents, createdAt: msg.createdAt }));
	}

	let messages = $state<Message[]>(untrack(() =>
		data.seedChat ? seedMessagesFromChat(data.seedChat) : seedMessageFromNotification(data.seedNotification)
	));
	let input = $state('');
	let loading = $state(false);
	let listEl = $state<HTMLElement | null>(null);
	let chatEl = $state<HTMLElement | null>(null);
	let inputWrapEl = $state<HTMLElement | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let enterToSend = $state(ls('enterToSend', 'true') !== 'false');
	let hasStarted = $state(untrack(() => !!data.seedNotification || (!!data.seedChat && data.seedChat.messages.length > 0)));
	let inputReady = $state(untrack(() => !hasStarted));
	let currentChatId: string | null = untrack(() => data.seedChat?.id ?? null);
	let panelForm = $state<FormContent | null>(null);
	let historyDrawerOpen = $state(false);

	type Turn = { id: string; userMsg: Message | null; assistantMsgs: Message[] };
	let turns = $derived.by(() => {
		const result: Turn[] = [];
		let current: Turn | null = null;
		for (const msg of messages) {
			if (msg.role === 'user') {
				current = { id: msg.id, userMsg: msg, assistantMsgs: [] };
				result.push(current);
			} else if (current) {
				current.assistantMsgs.push(msg);
			} else {
				current = { id: msg.id, userMsg: null, assistantMsgs: [msg] };
				result.push(current);
			}
		}
		return result;
	});
	let latestTurn = $derived<Turn | null>(turns.length > 0 ? turns[turns.length - 1] : null);
	let pastTurns = $derived(turns.slice(0, -1));
	let latestTurnMessages = $derived<Message[]>(
		latestTurn ? [...(latestTurn.userMsg ? [latestTurn.userMsg] : []), ...latestTurn.assistantMsgs] : []
	);

	let streamingText = $state('');
	let streamingUIContents = $state<MessageContent[]>([]);

	$effect(() => {
		const handler = () => {
			enterToSend = (localStorage.getItem('enterToSend') ?? 'true') !== 'false';
		};
		window.addEventListener('storage', handler);
		return () => window.removeEventListener('storage', handler);
	});

	let seededNotificationId: string | null = untrack(() => data.seedNotification?.id ?? null);

	$effect(() => {
		const seed = data.seedNotification;
		if (!seed || seed.id === seededNotificationId) return;
		seededNotificationId = seed.id;
		if (!hasStarted) hasStarted = true;
		messages = [
			...messages,
			{ id: crypto.randomUUID(), role: 'assistant', contents: seed.seedContent, createdAt: new Date() }
		];
	});

	$effect(() => {
		const urlChatId = page.url.searchParams.get('id');
		if (urlChatId === currentChatId) return;
		currentChatId = urlChatId;
		messages = seedMessagesFromChat(data.seedChat);
		hasStarted = !!data.seedChat && data.seedChat.messages.length > 0;
		streamingText = '';
		streamingUIContents = [];
		input = '';
	});

	let mountedResetToken = chatSession.resetToken;
	$effect(() => {
		const token = chatSession.resetToken;
		if (token === mountedResetToken) return;
		mountedResetToken = token;
		messages = [];
		hasStarted = false;
		streamingText = '';
		streamingUIContents = [];
		seededNotificationId = null;
		input = '';
	});

	function repositionInput(animate: boolean) {
		if (!inputWrapEl || !chatEl) return;
		const containerH = chatEl.offsetHeight;
		const inputH = inputWrapEl.offsetHeight;
		if (!hasStarted) {
			inputWrapEl.style.transition = '';
			inputWrapEl.style.transform = 'translateX(-50%)';
			inputWrapEl.style.bottom = '';
			inputWrapEl.style.top = `${(containerH - inputH) / 2}px`;
			return;
		}
		inputWrapEl.style.transition = animate
			? 'top 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
			: 'none';
		inputWrapEl.style.transform = 'translateX(-50%)';
		inputWrapEl.style.bottom = 'auto';
		inputWrapEl.style.top = `${containerH - inputH - 24}px`;
	}

	let isFirstEffect = true;
	$effect(() => {
		void hasStarted;
		const animate = !isFirstEffect;
		isFirstEffect = false;
		requestAnimationFrame(() => {
			repositionInput(animate);
			inputReady = true;
		});
	});

	$effect(() => {
		function handleResize() {
			requestAnimationFrame(() => repositionInput(false));
		}
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function autoGrow() {
		if (!textareaEl) return;
		textareaEl.style.height = 'auto';
		const sh = textareaEl.scrollHeight;
		if (sh >= CHAT_TEXTAREA_MAX_HEIGHT_PX) {
			textareaEl.style.height = `${CHAT_TEXTAREA_MAX_HEIGHT_PX}px`;
			textareaEl.style.overflowY = 'auto';
		} else {
			textareaEl.style.height = sh + 'px';
			textareaEl.style.overflowY = 'hidden';
		}
		requestAnimationFrame(() => repositionInput(false));
	}

	async function scrollLatestToTop() {
		await tick();
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		if (!listEl) return;
		const userMsgs = listEl.querySelectorAll('.message.user');
		const last = userMsgs[userMsgs.length - 1] as HTMLElement | undefined;
		if (!last) return;
		const containerTop = listEl.getBoundingClientRect().top;
		const msgTop = last.getBoundingClientRect().top;
		listEl.scrollTo({
			top: Math.max(0, listEl.scrollTop + msgTop - containerTop - 32),
			behavior: 'smooth'
		});
	}

	function addUserMessage(text: string, isFirst = false) {
		const message: Message = { id: crypto.randomUUID(), role: 'user', contents: [{ type: 'text', text }], createdAt: new Date() };
		messages = [...messages, message];
		persistMessage(message, isFirst ? text : undefined);
	}

	function assignChatId() {
		const url = new URL(window.location.href);
		if (url.searchParams.has('id') || url.searchParams.has('notification')) return;
		const id = crypto.randomUUID();
		url.searchParams.set('id', id);
		currentChatId = id;
		goto(`${url.pathname}?${url.searchParams}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

	function chatTitleFrom(text: string): string {
		const t = text.trim().replace(/\s+/g, ' ');
		return t.length > CHAT_TITLE_MAX_LENGTH ? t.slice(0, CHAT_TITLE_MAX_LENGTH) + '…' : t;
	}

	async function persistMessage(message: Message, firstMessageText?: string) {
		if (!currentChatId) return;
		const chatId = currentChatId;
		try {
			await fetch(`/api/chats/${chatId}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: message.id,
					role: message.role,
					contents: message.contents,
					...(firstMessageText ? { title: chatTitleFrom(firstMessageText) } : {})
				})
			});
		} catch {
			// 保存失敗時もチャット表示は継続する
		}
		if (firstMessageText) {
			chatHistory.prepend({ id: chatId, title: chatTitleFrom(firstMessageText), updatedAt: new Date().toISOString() });
			requestChatTitle(chatId, firstMessageText);
		}
	}

	async function requestChatTitle(chatId: string, message: string) {
		try {
			const res = await fetch(`/api/chats/${chatId}/title`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message })
			});
			if (!res.ok) return;
			const { title } = (await res.json()) as { title: string };
			if (title) chatHistory.updateTitle(chatId, title);
		} catch {
			// 失敗時は切り詰めタイトルのまま
		}
	}

	function finalizeStreamingMessage() {
		const contents: MessageContent[] = [];
		if (streamingText.trim()) contents.push({ type: 'text', text: streamingText });
		for (const c of streamingUIContents) {
			contents.push(c);
		}
		if (contents.length === 0) {
			contents.push({ type: 'text', text: m.chat_error() });
		}
		if (contents.length > 0) {
			const message: Message = { id: crypto.randomUUID(), role: 'assistant', contents, createdAt: new Date() };
			messages = [...messages, message];
			persistMessage(message);
		}
		streamingText = '';
		streamingUIContents = [];
	}

	async function submitToChat(tool: string, data: Record<string, string>) {
		loading = true;
		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tool, data, history: messages })
			});
			const result = (await res.json()) as { contents: MessageContent[] };
			const message: Message = { id: crypto.randomUUID(), role: 'assistant', contents: result.contents, createdAt: new Date() };
			messages = [...messages, message];
			persistMessage(message);
		} catch {
			const message: Message = {
				id: crypto.randomUUID(),
				role: 'assistant',
				contents: [{ type: 'text', text: m.chat_error() }],
				createdAt: new Date()
			};
			messages = [...messages, message];
			persistMessage(message);
		} finally {
			loading = false;
		}
	}

	async function sendMessage(text: string, isFirst = false) {
		addUserMessage(text, isFirst);
		loading = true;
		streamingText = '';
		streamingUIContents = [];
		await scrollLatestToTop();
		repositionInput(false);

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: text, history: messages })
			});

			if (!res.ok || !res.body) {
				finalizeStreamingMessage();
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = '';
			let finalized = false;

			const finalize = () => {
				if (finalized) return;
				finalized = true;
				finalizeStreamingMessage();
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buf += decoder.decode(value, { stream: true });
				const parts = buf.split('\n\n');
				buf = parts.pop() ?? '';

				for (const part of parts) {
					const line = part.trim();
					if (!line.startsWith('data: ')) continue;
					try {
						const event = JSON.parse(line.slice(6)) as StreamEvent;
						if (event.type === 'delta') {
							streamingText += event.text;
						} else if (event.type === 'ui') {
							streamingUIContents = [...streamingUIContents, event.content];
						} else if (event.type === 'done') {
							finalize();
						} else if (event.type === 'error') {
							streamingText = m.chat_error();
							finalize();
						}
					} catch {
						// JSON parse error, skip
					}
				}
			}

			finalize();
		} catch {
			streamingText = '';
			messages = [
				...messages,
				{
					id: crypto.randomUUID(),
					role: 'assistant',
					contents: [{ type: 'text', text: m.chat_error() }],
					createdAt: new Date()
				}
			];
		} finally {
			loading = false;
		}
	}

	async function handleSubmit() {
		const text = input.trim();
		if (!text || loading) return;
		input = '';
		if (textareaEl) textareaEl.style.height = 'auto';
		const isFirst = !hasStarted;
		if (isFirst) {
			hasStarted = true;
			assignChatId();
		}
		await sendMessage(text, isFirst);
	}

	async function handleActionSelect(action: ActionItem) {
		if (loading) return;
		const isFirst = !hasStarted;
		if (isFirst) {
			hasStarted = true;
			assignChatId();
		}
		await sendMessage(action.label, isFirst);
	}

	async function handleReplySubmit(msg: Message, content: ReplyContent, answer: string) {
		if (loading) return;
		const isFirst = !hasStarted;
		if (isFirst) {
			hasStarted = true;
			assignChatId();
		}
		content.completed = true;
		persistMessage(msg);
		await sendMessage(answer, isFirst);
	}

	async function handlePanelSubmit(tool: string, data: Record<string, string>) {
		panelForm = null;
		await submitToChat(tool, data);
	}

	function handlePanelCancel() {
		panelForm = null;
	}

	function handleKey(e: KeyboardEvent) {
		if (enterToSend && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			handleSubmit();
		}
	}

	// suppress unused import warning
	void toast;
</script>

<div class="chat" bind:this={chatEl}>
	<div class="greeting" class:hidden={hasStarted} aria-hidden={hasStarted}>
		<h1>TULLAMORE</h1>
		<p>データについて質問してください</p>
	</div>

	{#if hasStarted && pastTurns.length > 0}
		<button class="history-btn" onclick={() => (historyDrawerOpen = true)} aria-label="会話履歴">
			<Clock size={16} />
		</button>
	{/if}

	<div class="messages" class:visible={hasStarted} bind:this={listEl}>
		<div class="messages-inner">
			{#each latestTurnMessages as msg (msg.id)}
				<div class="message {msg.role}">
					{#if msg.role === 'user'}
						<div class="user-bubble">
							{#each msg.contents as content}
								{#if content.type === 'text'}{content.text}{/if}
							{/each}
						</div>
					{:else}
						<div class="assistant-message">
							{#each (msg.contents as MessageContent[]) as content}
								{#if content.type === 'text'}
									<div class="assistant-text">{@html renderMarkdown(content.text)}</div>
								{:else if content.type === 'form'}
									<FormButton form={content} onclick={() => { panelForm = content; }} />
								{:else if content.type === 'table'}
									<Table columns={content.columns} rows={content.rows} />
								{:else if content.type === 'actions'}
									<ActionSelector
										title={content.title}
										actions={content.actions}
										onselect={handleActionSelect}
									/>
								{:else}
									{@const extra = content as ValuesContent | ChartContent | LinkContent | ReplyContent | SimulatorContent}
									{#if extra.type === 'values'}
										<Values title={extra.title} items={extra.items} />
									{:else if extra.type === 'chart'}
										<Chart chartType={extra.chartType} title={extra.title} mode={extra.mode} data={extra.data} series={extra.series} />
									{:else if extra.type === 'link'}
										<Link label={extra.label} href={extra.href} description={extra.description} newTab={extra.newTab} />
									{:else if extra.type === 'simulator'}
										<Simulator
											simulatorId={extra.simulatorId}
											name={extra.name}
											description={extra.description}
											targetLabel={extra.targetLabel}
											intercept={extra.intercept}
											features={extra.features}
											metrics={extra.metrics}
										/>
									{:else if extra.type === 'reply'}
										{#if !extra.completed}
											<Reply
												title={extra.title}
												fields={extra.fields}
												submitLabel={extra.submitLabel}
												onsubmit={(answer) => handleReplySubmit(msg, extra, answer)}
											/>
										{/if}
									{/if}
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			{#if loading}
				<div class="message assistant">
					<div class="assistant-message">
						<TypingIndicator />
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="input-wrap" bind:this={inputWrapEl} style:opacity={inputReady ? 1 : 0}>
		<div class="input-card">
			<textarea
				bind:this={textareaEl}
				bind:value={input}
				oninput={autoGrow}
				onkeydown={handleKey}
				placeholder={enterToSend ? m.chat_placeholder_enter() : m.chat_placeholder_noenter()}
				rows="1"
				disabled={loading}
			></textarea>
			<div class="input-footer">
				<button
					class="send-btn"
					onclick={handleSubmit}
					disabled={loading || !input.trim()}
					aria-label="送信"
				>
					<ArrowUp size={16} />
				</button>
			</div>
		</div>
	</div>

	{#if panelForm}
		<FormDialog
			form={panelForm}
			onsubmit={handlePanelSubmit}
			oncancel={handlePanelCancel}
		/>
	{/if}
	<TurnHistoryDrawer turns={pastTurns} open={historyDrawerOpen} onclose={() => (historyDrawerOpen = false)} />
</div>

<style lang="scss">
	.chat {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.greeting {
		position: absolute;
		width: 100%;
		left: 0;
		bottom: calc(50% + 100px);
		text-align: center;
		pointer-events: none;
		z-index: 1;
		transition: opacity 0.3s ease;
	}

	.greeting.hidden {
		opacity: 0;
	}

	.greeting h1 {
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-primary);
		margin: 0 0 10px;
		letter-spacing: -0.02em;
		font-family: Georgia, 'Times New Roman', Times, serif;
	}

	.greeting p {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.history-btn {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 6;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color-surface);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	.messages {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		padding: 24px 24px 200px;
		display: none;
		flex-direction: column;

		&.visible { display: flex; }
	}

	.messages-inner {
		max-width: 720px;
		width: 100%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.message {
		display: flex;

		&.user { justify-content: flex-end; }
		&.assistant { justify-content: flex-start; }
	}

	.user-bubble {
		max-width: 72%;
		padding: 10px 16px;
		background: var(--color-primary);
		color: #fff;
		border-radius: 18px 18px 4px 18px;
		font-size: 0.9375rem;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.assistant-message {
		max-width: 100%;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.assistant-text {
		font-size: 0.9375rem;
		line-height: 1.65;
		color: var(--color-text);

		:global(p) { margin: 0 0 0.75em; }
		:global(p:last-child) { margin-bottom: 0; }
		:global(ul), :global(ol) { padding-left: 1.5em; margin: 0 0 0.75em; }
		:global(li) { margin-bottom: 0.25em; }
		:global(code) {
			font-family: ui-monospace, monospace;
			font-size: 0.875em;
			background: var(--color-surface);
			border: 1px solid var(--color-border);
			padding: 1px 5px;
			border-radius: 4px;
		}
		:global(pre) {
			background: var(--color-surface);
			border: 1px solid var(--color-border);
			border-radius: 8px;
			padding: 12px 16px;
			overflow-x: auto;

			:global(code) { background: none; border: none; padding: 0; }
		}
		:global(h1), :global(h2), :global(h3) { font-weight: 600; margin: 0.75em 0 0.5em; }
		:global(strong) { font-weight: 600; }
		:global(a) { color: var(--color-primary); text-decoration: underline; }
	}

	.input-wrap {
		position: absolute;
		left: 50%;
		/* 未開始時の初期配置はCSSで中央寄せ（JS不要・SSR時点で正位置）。
		   開始後はJS(repositionInput)が top(px)/translateX(-50%) を設定して下部へスライドする。 */
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(720px, calc(100% - 48px));
		z-index: 5;
		transition: opacity 0.2s;
	}

	.input-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 16px;
		padding: 12px 12px 8px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
	}

	textarea {
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--color-text);
		font-family: inherit;
		max-height: 200px;
		overflow-y: hidden;

		&::placeholder { color: var(--color-text-muted); }
		&:disabled { opacity: 0.6; }
	}

	.input-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		margin-top: 4px;
	}

	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		transition: opacity 0.15s;
		flex-shrink: 0;

		&:hover { opacity: 0.85; }
		&:disabled { opacity: 0.35; cursor: not-allowed; }
	}
</style>
