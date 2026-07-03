<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<path d="M9 2v6" />
	<path d="M15 2v6" />
	<path d="M6 8h12v4a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
	<path d="M12 18v4" />
</svg>
