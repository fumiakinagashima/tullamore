<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<rect x="3" y="3" width="18" height="18" rx="3" />
	<circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
	<circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
	<circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
	<circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
	<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
</svg>
