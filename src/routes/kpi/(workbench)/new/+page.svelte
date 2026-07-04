<script lang="ts">
	import type { PageData } from './$types';
	import KpiPlanForm from '$lib/components/analysis/KpiPlanForm.svelte';

	let { data }: { data: PageData } = $props();
</script>

<KpiPlanForm sources={data.sources} mode="create" />
