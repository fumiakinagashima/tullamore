<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<circle cx="5" cy="6" r="2" />
	<circle cx="19" cy="6" r="2" />
	<circle cx="12" cy="18" r="2" />
	<path d="M5 8v2a4 4 0 0 0 4 4h1" />
	<path d="M19 8v2a4 4 0 0 1-4 4h-1" />
</svg>
