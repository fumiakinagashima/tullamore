<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { children: Snippet };

	let { children }: Props = $props();

	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 3;
	const ZOOM_STEP = 0.25;

	let level = $state(1);
	// CSSの `zoom` プロパティは width:100% 等のパーセンテージ指定の子には視覚的な効果がない
	// （auto-fillの結果は常にコンテナ幅と一致してしまう）ため、transform: scale() を使う。
	// transform は要素自身のレイアウト上の専有サイズを変えないので、
	// .zoom-viewport（スクロール領域）に実際のスクロール幅を持たせるための「サイズ確保用」要素（.zoom-sizer）を
	// 別途 width/height を明示指定して用意し、その中で内容を scale する。
	// bind:clientWidth/clientHeight は transform の影響を受けないため、フィードバックループにはならない
	let baseWidth = $state(0);
	let baseHeight = $state(0);

	function zoomIn() {
		level = Math.min(MAX_ZOOM, Math.round((level + ZOOM_STEP) * 100) / 100);
	}
	function zoomOut() {
		level = Math.max(MIN_ZOOM, Math.round((level - ZOOM_STEP) * 100) / 100);
	}
	function reset() {
		level = 1;
	}
</script>

<div class="zoomable">
	<div class="zoom-controls">
		<button type="button" onclick={zoomOut} disabled={level <= MIN_ZOOM} aria-label="縮小">−</button>
		<button type="button" class="level" onclick={reset} disabled={level === 1} aria-label="表示倍率をリセット">
			{Math.round(level * 100)}%
		</button>
		<button type="button" onclick={zoomIn} disabled={level >= MAX_ZOOM} aria-label="拡大">＋</button>
	</div>
	<div class="zoom-viewport" bind:clientWidth={baseWidth}>
		<div
			class="zoom-sizer"
			style:width={baseWidth ? `${baseWidth * level}px` : undefined}
			style:height={baseHeight ? `${baseHeight * level}px` : undefined}
		>
			<div class="zoom-content" bind:clientHeight={baseHeight} style:width={baseWidth ? `${baseWidth}px` : undefined} style:transform="scale({level})">
				{@render children()}
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	.zoomable {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.zoom-controls {
		display: inline-flex;
		align-self: flex-end;
		align-items: center;
		gap: 1px;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		padding: 2px;

		button {
			min-width: 22px;
			height: 22px;
			padding: 0 6px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: transparent;
			border: none;
			border-radius: 999px;
			font-size: 0.75rem;
			line-height: 1;
			color: var(--color-text-muted);
			cursor: pointer;
			transition: background 0.15s, color 0.15s;

			&:hover:not(:disabled) {
				background: var(--color-border);
				color: var(--color-text);
			}
			&:disabled {
				opacity: 0.4;
				cursor: default;
			}
		}

		.level {
			min-width: 42px;
			font-variant-numeric: tabular-nums;
		}
	}

	.zoom-viewport {
		overflow: auto;
	}

	.zoom-content {
		transform-origin: top left;
	}
</style>
