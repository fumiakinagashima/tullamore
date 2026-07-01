<script lang="ts">
	import type { PageData } from './$types';
	import Simulator from '$lib/components/chat/Simulator.svelte';
	import DialogChatSide from '$lib/components/dialog/DialogChatSide.svelte';

	let { data }: { data: PageData } = $props();

	const FIT_LABEL: Record<string, string> = {
		excellent: '非常に良好',
		good: '良好',
		moderate: 'やや弱い',
		weak: '弱い'
	};

	const recordContext = $derived({
		type: 'simulator',
		typeLabel: 'シミュレーター',
		id: data.content.simulatorId,
		label: data.content.name,
		data: {
			目的変数: data.content.targetLabel,
			切片: data.content.intercept,
			説明変数: data.content.features.map((f) => ({ 変数名: f.label, 係数: f.coefficient, 実測範囲: `${f.min}〜${f.max}` })),
			決定係数R2: data.content.metrics.r2,
			サンプル数: data.content.metrics.sampleSize,
			妥当性チェック: data.review
		}
	});
</script>

<div class="page">
	<div class="page-header">
		<a href="/simulators" class="back-link">← シミュレーター</a>
	</div>

	<div class="layout">
		<div class="content-side">
			<div class="content-inner">
				<Simulator
					simulatorId={data.content.simulatorId}
					name={data.content.name}
					description={data.content.description}
					targetLabel={data.content.targetLabel}
					intercept={data.content.intercept}
					features={data.content.features}
					metrics={data.content.metrics}
				/>

				<div class="review-card">
					<p class="review-title">AIレビュー（妥当性チェック）</p>
					<div class="review-row">
						<span class="review-label">当てはまり</span>
						<span class="review-badge {data.review.fitQuality}">{FIT_LABEL[data.review.fitQuality]}</span>
					</div>
					<p class="review-comment">{data.review.fitComment}</p>
					<p class="review-comment">{data.review.sampleSizeComment}</p>
					{#if data.review.multicollinearityComment}
						<p class="review-comment warn">{data.review.multicollinearityComment}</p>
					{/if}
					<p class="review-overall">{data.review.overallComment}</p>
				</div>

				<a href="/data/{data.dataSourceId}" class="source-link">生成元データソース: {data.dataSourceName} →</a>
			</div>
		</div>
		<div class="chat-side">
			<DialogChatSide contextTitle={data.content.name} contextFields={[]} {recordContext} />
		</div>
	</div>
</div>

<style lang="scss">
	.page {
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.page-header {
		padding: 16px 24px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.back-link {
		font-size: 0.875rem;
		color: var(--color-primary);
		text-decoration: none;

		&:hover { text-decoration: underline; }
	}

	.layout {
		flex: 1;
		min-height: 0;
		display: flex;
		overflow: hidden;
	}

	.chat-side {
		width: 320px;
		flex-shrink: 0;
		border-left: 1px solid var(--color-border);
		overflow: hidden;
	}

	.content-side {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 24px;
	}

	.content-inner {
		max-width: 720px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.review-card {
		padding: 16px 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.review-title { font-weight: 600; font-size: 0.875rem; color: var(--color-text); margin: 0 0 10px; }

	.review-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.review-label { font-size: 0.8125rem; color: var(--color-text-muted); }

	.review-badge {
		padding: 2px 10px;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;

		&.excellent, &.good { background: var(--color-success-bg); color: var(--color-success); }
		&.moderate { background: var(--color-neutral-bg); color: var(--color-warning); }
		&.weak { background: var(--color-error-bg); color: var(--color-error); }
	}

	.review-comment {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 6px;

		&.warn { color: var(--color-warning); }
	}

	.review-overall {
		font-size: 0.8125rem;
		color: var(--color-text);
		margin: 10px 0 0;
		padding-top: 10px;
		border-top: 1px solid var(--color-border);
	}

	.source-link {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		text-decoration: none;

		&:hover { color: var(--color-primary); }
	}
</style>
