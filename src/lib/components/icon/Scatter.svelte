<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<path d="M3 3v18h18" />
	<circle cx="7.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
	<circle cx="11.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
	<circle cx="15" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
	<circle cx="18.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
</svg>
