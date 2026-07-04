<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<polygon points="12 2 2 8 12 14 22 8 12 2" />
	<polyline points="2 13 12 19 22 13" />
	<polyline points="2 18 12 22 22 18" />
</svg>
