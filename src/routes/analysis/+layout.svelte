<script lang="ts">
	import { setContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import { ANALYSIS_BRIDGE_KEY, createAnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import AnalysisAssistant from '$lib/components/analysis/AnalysisAssistant.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// 各分析ページ（回帰分析・トレンド予測）が現在の設定値・結果・setterを登録し、
	// 右側のAIアシスタントがそれを読んで「設定をセットする」「妥当性について答える」を行う
	const bridge = createAnalysisBridge();
	setContext(ANALYSIS_BRIDGE_KEY, bridge);

	// AIアシスタント欄の幅（ドラッグでリサイズ可能。localStorageに記憶する。/simulators/[id] と同じパターン）
	const ASSISTANT_WIDTH_STORAGE_KEY = 'tullamore_analysis_assistant_width';
	const ASSISTANT_WIDTH_MIN = 260;
	const ASSISTANT_WIDTH_MAX = 560;
	const ASSISTANT_WIDTH_DEFAULT = 300;
	const ASSISTANT_WIDTH_KEY_STEP = 20;

	function clampAssistantWidth(w: number): number {
		return Math.min(ASSISTANT_WIDTH_MAX, Math.max(ASSISTANT_WIDTH_MIN, w));
	}

	function loadAssistantWidth(): number {
		if (typeof localStorage === 'undefined') return ASSISTANT_WIDTH_DEFAULT;
		const raw = Number(localStorage.getItem(ASSISTANT_WIDTH_STORAGE_KEY));
		return Number.isFinite(raw) && raw > 0 ? clampAssistantWidth(raw) : ASSISTANT_WIDTH_DEFAULT;
	}

	let assistantWidth = $state(loadAssistantWidth());
	let resizing = $state(false);

	function startResize(e: PointerEvent) {
		e.preventDefault();
		resizing = true;
		const startX = e.clientX;
		const startWidth = assistantWidth;

		function onMove(ev: PointerEvent) {
			// パネルは右側なので、左にドラッグするほど幅が広がる
			assistantWidth = clampAssistantWidth(startWidth + (startX - ev.clientX));
		}
		function onUp() {
			resizing = false;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			localStorage.setItem(ASSISTANT_WIDTH_STORAGE_KEY, String(assistantWidth));
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	function handleResizeKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const delta = e.key === 'ArrowLeft' ? ASSISTANT_WIDTH_KEY_STEP : -ASSISTANT_WIDTH_KEY_STEP;
		assistantWidth = clampAssistantWidth(assistantWidth + delta);
		localStorage.setItem(ASSISTANT_WIDTH_STORAGE_KEY, String(assistantWidth));
	}
</script>

<div class="workbench">
	<div class="analysis-main">
		{@render children()}
	</div>
	<!-- ARIA Window Splitter パターン（https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/）:
	     role="separator" + tabindex + キー操作は非対話要素向けのa11y-lintでは検出できない正しい組み合わせ -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="resize-handle"
		class:active={resizing}
		role="separator"
		aria-orientation="vertical"
		aria-label="AIアシスタントの幅を調整"
		aria-valuenow={assistantWidth}
		aria-valuemin={ASSISTANT_WIDTH_MIN}
		aria-valuemax={ASSISTANT_WIDTH_MAX}
		tabindex="0"
		onpointerdown={startResize}
		onkeydown={handleResizeKey}
	></div>
	<aside class="analysis-sidebar" style:width="{assistantWidth}px">
		<AnalysisAssistant
			analysisType={bridge.analysisType}
			sources={data.sources}
			config={bridge.config}
			resultSummary={bridge.resultSummary}
			onApplyConfig={(patch) => bridge.applyConfig?.(patch)}
		/>
	</aside>
</div>

<style lang="scss">
	.workbench {
		display: flex;
		height: 100vh;
		overflow: hidden;
	}

	.analysis-main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
	}

	.resize-handle {
		flex-shrink: 0;
		width: 5px;
		cursor: col-resize;
		position: relative;
		background: transparent;

		&::after {
			content: '';
			position: absolute;
			top: 0;
			bottom: 0;
			left: 4px;
			width: 2px;
			background: var(--color-border);
		}

		&:hover::after, &.active::after {
			left: 1px;
			width: 3px;
			background: var(--color-primary);
		}

		&:focus-visible {
			outline: 2px solid var(--color-primary);
			outline-offset: -2px;
		}
	}

	.analysis-sidebar {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		overflow: hidden;
	}
</style>
