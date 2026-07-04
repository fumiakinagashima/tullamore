<script lang="ts">
	import type { PageData } from './$types';
	import KpiPlanForm from '$lib/components/analysis/KpiPlanForm.svelte';

	let { data }: { data: PageData } = $props();
</script>

<KpiPlanForm
	sources={data.sources}
	mode="edit"
	planId={data.plan.id}
	initial={{
		name: data.plan.name,
		dataSourceId: data.snapshot.dataSourceId,
		targetColumn: data.snapshot.targetColumn,
		featureColumns: data.snapshot.featureColumns,
		targetValue: data.snapshot.targetValue,
		periodType: data.plan.periodType,
		periodLabel: data.plan.periodLabel,
		model: data.snapshot.model,
		validity: data.snapshot.validity,
		plan: data.snapshot.plan
	}}
/>
