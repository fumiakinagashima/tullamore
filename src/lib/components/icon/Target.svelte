<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<circle cx="12" cy="12" r="9" />
	<circle cx="12" cy="12" r="5" />
	<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
</svg>
