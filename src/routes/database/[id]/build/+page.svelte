<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import DataSourceForm from '$lib/components/database/DataSourceForm.svelte';
	import type { FormColumn } from '$lib/components/database/DataSourceForm.svelte';

	let { data }: { data: PageData } = $props();
	let { source, columns } = $derived(data);

	let saving = $state(false);
	let error = $state('');

	async function handleSubmit(formData: { name: string; description: string; columns: FormColumn[] }) {
		saving = true;
		error = '';
		try {
			const schemaRes = await fetch(`/api/data-sources/${source.id}/schema`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					columns: formData.columns.map((c) => ({
						originalKey: c.originalKey,
						key: c.key,
						label: c.label,
						type: c.type
					}))
				})
			});
			const schemaJson = (await schemaRes.json()) as { error?: string };
			if (!schemaRes.ok) throw new Error(schemaJson.error ?? 'Failed to update the schema');

			const infoRes = await fetch(`/api/data-sources/${source.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: formData.name, description: formData.description })
			});
			if (!infoRes.ok) throw new Error('Failed to update the name/description');

			await invalidateAll();
			await goto(`/database/${source.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Update failed';
		} finally {
			saving = false;
		}
	}
</script>

<DataSourceForm
	mode="edit"
	title="Edit Table"
	submitLabel="Save"
	submitting={saving}
	{error}
	cancelHref="/database/{source.id}"
	initialName={source.name}
	initialDescription={source.description ?? ''}
	initialColumns={columns}
	onsubmit={handleSubmit}
/>
