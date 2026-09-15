<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import DataSourceForm from '$lib/components/database/DataSourceForm.svelte';
	import type { FormColumn } from '$lib/components/database/DataSourceForm.svelte';

	let creating = $state(false);
	let error = $state('');

	async function handleSubmit(data: { name: string; description: string; columns: FormColumn[] }) {
		creating = true;
		error = '';
		try {
			const res = await fetch('/api/data-sources', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: data.name,
					description: data.description || undefined,
					columns: data.columns.map((c) => ({ key: c.key, label: c.label, type: c.type }))
				})
			});
			const json = (await res.json()) as { id?: string; error?: string };
			if (!res.ok) throw new Error(json.error ?? 'Failed to create');
			await invalidateAll();
			await goto(`/database/${json.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create';
		} finally {
			creating = false;
		}
	}
</script>

<DataSourceForm
	mode="create"
	title="New Table"
	submitLabel="Create"
	submitting={creating}
	{error}
	cancelHref="/database"
	onsubmit={handleSubmit}
/>
