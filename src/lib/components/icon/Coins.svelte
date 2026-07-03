<script lang="ts">
	let { size = 24, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
	<ellipse cx="9" cy="7" rx="6" ry="3.5" />
	<path d="M3 7v5c0 1.93 2.69 3.5 6 3.5s6-1.57 6-3.5V7" />
	<path d="M3 12v5c0 1.93 2.69 3.5 6 3.5s6-1.57 6-3.5v-5" />
	<path d="M15 9.5c3 .3 6 1.7 6 3.5s-2.69 3.5-6 3.5c-.7 0-1.37-.07-2-.2" />
	<path d="M21 13v5c0 1.63-2.09 2.97-4.8 3.38" />
</svg>
