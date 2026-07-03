<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<circle cx="6" cy="18" r="3" />
	<circle cx="18" cy="6" r="3" />
	<path d="M6 15V9a3 3 0 0 1 3-3h6" />
	<path d="M18 9v6a3 3 0 0 1-3 3H9" />
</svg>
