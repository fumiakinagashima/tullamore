<script lang="ts">
	import type { ValidityAssessment, ValidityLevel } from '$lib/analysis/validity';
	import Check from '$lib/components/icon/Check.svelte';
	import AlertCircle from '$lib/components/icon/AlertCircle.svelte';

	type Props = { validity: ValidityAssessment };
	let { validity }: Props = $props();

	const LEVEL_LABEL: Record<ValidityLevel, string> = { good: '妥当', caution: '要注意', poor: '要検討' };
</script>

<div class="validity-card level-{validity.overallLevel}">
	<div class="validity-header">
		<span class="level-badge">
			{#if validity.overallLevel === 'good'}
				<Check size={13} />
			{:else}
				<AlertCircle size={13} />
			{/if}
			{LEVEL_LABEL[validity.overallLevel]}
		</span>
		<p class="overall-comment">{validity.overallComment}</p>
	</div>
	<ul class="check-list">
		{#each validity.checks as check, i (i)}
			<li class="check-item level-{check.level}">
				<span class="check-label">{check.label}</span>
				<span class="check-comment">{check.comment}</span>
			</li>
		{/each}
	</ul>
</div>

<style lang="scss">
	.validity-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.validity-header {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.level-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-neutral);

		.level-good & { color: var(--color-success); }
		.level-caution & { color: var(--color-warning); }
		.level-poor & { color: var(--color-error); }
	}

	.overall-comment {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text);
		line-height: 1.6;
	}

	.check-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.check-item {
		display: flex;
		gap: 8px;
		font-size: 0.75rem;
		line-height: 1.6;
	}

	.check-label {
		flex-shrink: 0;
		min-width: 88px;
		font-weight: 600;
		color: var(--color-text-muted);

		.level-poor & { color: var(--color-error); }
		.level-caution & { color: var(--color-warning); }
	}

	.check-comment {
		color: var(--color-text);
	}
</style>
