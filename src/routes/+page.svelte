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
	import type { MessageContent, ValuesContent, ChartContent, LinkContent, ReplyContent, SimulatorContent } from '$lib/types/chat';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from '$lib/stores/toast.svelte';
	import ArrowUp from '$lib/components/icon/ArrowUp.svelte';
	import Clock from '$lib/components/icon/Clock.svelte';
	import { createChatState, renderMarkdown } from './index.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = createChatState(() => data);

	// suppress unused import warning
	void toast;
</script>

<div class="chat" bind:this={s.chatEl}>
	<div class="greeting" class:hidden={s.hasStarted} aria-hidden={s.hasStarted}>
		<h1>TULLAMORE</h1>
		<p>データについて質問してください</p>
	</div>

	{#if s.hasStarted && s.pastTurns.length > 0}
		<button class="history-btn" onclick={() => (s.historyDrawerOpen = true)} aria-label="会話履歴">
			<Clock size={16} />
		</button>
	{/if}

	<div class="messages" class:visible={s.hasStarted} bind:this={s.listEl}>
		<div class="messages-inner">
			{#each s.latestTurnMessages as msg (msg.id)}
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
									<FormButton form={content} onclick={() => { s.panelForm = content; }} />
								{:else if content.type === 'table'}
									<Table columns={content.columns} rows={content.rows} />
								{:else if content.type === 'actions'}
									<ActionSelector
										title={content.title}
										actions={content.actions}
										onselect={s.handleActionSelect}
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
												onsubmit={(answer) => s.handleReplySubmit(msg, extra, answer)}
											/>
										{/if}
									{/if}
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			{#if s.loading}
				<div class="message assistant">
					<div class="assistant-message">
						<TypingIndicator />
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="input-wrap" bind:this={s.inputWrapEl} style:opacity={s.inputReady ? 1 : 0}>
		<div class="input-card">
			<textarea
				bind:this={s.textareaEl}
				bind:value={s.input}
				oninput={s.autoGrow}
				onkeydown={s.handleKey}
				placeholder={s.enterToSend ? m.chat_placeholder_enter() : m.chat_placeholder_noenter()}
				rows="1"
				disabled={s.loading}
			></textarea>
			<div class="input-footer">
				<button
					class="send-btn"
					onclick={s.handleSubmit}
					disabled={s.loading || !s.input.trim()}
					aria-label="送信"
				>
					<ArrowUp size={16} />
				</button>
			</div>
		</div>
	</div>

	{#if s.panelForm}
		<FormDialog
			form={s.panelForm}
			onsubmit={s.handlePanelSubmit}
			oncancel={s.handlePanelCancel}
		/>
	{/if}
	<TurnHistoryDrawer turns={s.pastTurns} open={s.historyDrawerOpen} onclose={() => (s.historyDrawerOpen = false)} />
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
