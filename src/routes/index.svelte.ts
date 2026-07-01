import { tick, untrack } from 'svelte';
import { marked } from 'marked';
import { filterXSS } from 'xss';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { chatSession } from '$lib/stores/chat-session.svelte';
import { chatHistory } from '$lib/stores/chat-history.svelte';
import * as m from '$lib/paraglide/messages.js';
import { CHAT_TITLE_MAX_LENGTH, CHAT_TEXTAREA_MAX_HEIGHT_PX } from '$lib/constants';
import type { Message, MessageContent, FormContent, ActionItem, ReplyContent } from '$lib/types/chat';
import type { StreamEvent } from '$lib/server/ai/stream';
import type { PageData } from './$types';

export function renderMarkdown(text: string): string {
	return filterXSS(marked.parse(text, { async: false }) as string);
}

const ls = (key: string, def: string) =>
	typeof localStorage !== 'undefined' ? (localStorage.getItem(key) ?? def) : def;

function seedMessageFromNotification(seed: { id: string; seedContent: MessageContent[] } | null): Message[] {
	if (!seed) return [];
	return [{ id: crypto.randomUUID(), role: 'assistant', contents: seed.seedContent, createdAt: new Date() }];
}

function seedMessagesFromChat(
	seed: { id: string; messages: { id: string; role: 'user' | 'assistant'; contents: MessageContent[]; createdAt: Date }[] } | null
): Message[] {
	if (!seed) return [];
	return seed.messages.map((msg) => ({ id: msg.id, role: msg.role, contents: msg.contents, createdAt: msg.createdAt }));
}

type Turn = { id: string; userMsg: Message | null; assistantMsgs: Message[] };

export function createChatState(getData: () => PageData) {
	let messages = $state<Message[]>(untrack(() =>
		getData().seedChat ? seedMessagesFromChat(getData().seedChat) : seedMessageFromNotification(getData().seedNotification)
	));
	let input = $state('');
	let loading = $state(false);
	let listEl = $state<HTMLElement | null>(null);
	let chatEl = $state<HTMLElement | null>(null);
	let inputWrapEl = $state<HTMLElement | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let enterToSend = $state(ls('enterToSend', 'true') !== 'false');
	let hasStarted = $state(untrack(() => {
		const d = getData();
		return !!d.seedNotification || (!!d.seedChat && d.seedChat.messages.length > 0);
	}));
	let inputReady = $state(untrack(() => !hasStarted));
	let currentChatId: string | null = untrack(() => getData().seedChat?.id ?? null);
	let panelForm = $state<FormContent | null>(null);
	let historyDrawerOpen = $state(false);

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

	let seededNotificationId: string | null = untrack(() => getData().seedNotification?.id ?? null);

	$effect(() => {
		const seed = getData().seedNotification;
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
		const seedChat = getData().seedChat;
		messages = seedMessagesFromChat(seedChat);
		hasStarted = !!seedChat && seedChat.messages.length > 0;
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

	return {
		get input() { return input; },
		set input(v) { input = v; },
		get loading() { return loading; },
		get listEl() { return listEl; },
		set listEl(v) { listEl = v; },
		get chatEl() { return chatEl; },
		set chatEl(v) { chatEl = v; },
		get inputWrapEl() { return inputWrapEl; },
		set inputWrapEl(v) { inputWrapEl = v; },
		get textareaEl() { return textareaEl; },
		set textareaEl(v) { textareaEl = v; },
		get enterToSend() { return enterToSend; },
		get hasStarted() { return hasStarted; },
		get inputReady() { return inputReady; },
		get panelForm() { return panelForm; },
		set panelForm(v) { panelForm = v; },
		get historyDrawerOpen() { return historyDrawerOpen; },
		set historyDrawerOpen(v) { historyDrawerOpen = v; },
		get pastTurns() { return pastTurns; },
		get latestTurnMessages() { return latestTurnMessages; },
		autoGrow,
		handleSubmit,
		handleActionSelect,
		handleReplySubmit,
		handlePanelSubmit,
		handlePanelCancel,
		handleKey
	};
}
