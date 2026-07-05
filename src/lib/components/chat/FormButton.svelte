<script lang="ts">
	import type { FormContent } from '$lib/types/chat';
	import ChevronRight from '$lib/components/icon/ChevronRight.svelte';

	type Props = {
		form: FormContent;
		onclick: () => void;
	};

	let { form, onclick }: Props = $props();

	const TOOL_LABELS: Record<string, string> = {
		send_email: 'メールを送信'
	};

	const TOOL_DESCS: Record<string, string> = {
		send_email: 'メール作成フォームを表示します'
	};

	const label = $derived(form.title ?? TOOL_LABELS[form.tool] ?? '登録・編集フォームを開く');
	const desc = $derived(TOOL_DESCS[form.tool] ?? '登録・編集ダイアログを表示します');
</script>

<button class="form-btn" {onclick}>
	<span class="label">{label}</span>
	<span class="desc">{desc}</span>
	<ChevronRight size={16} class="icon" />
</button>

<style lang="scss">
	.form-btn {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		max-width: 420px;
		padding: 10px 36px 10px 14px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;

		&:hover {
			border-color: var(--color-primary);
			background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
		}
	}

	.label {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.desc {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	:global(.icon) {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}
</style>
