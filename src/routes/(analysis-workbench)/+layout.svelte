<script lang="ts">
	import { setContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import { ANALYSIS_BRIDGE_KEY, createAnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import AnalysisAssistant from '$lib/components/analysis/AnalysisAssistant.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Each analysis page (regression, trend forecasting, etc.) registers its current config,
	// results, and setter, and the AI assistant on the right reads them to "set the config" and
	// "answer questions about validity"
	const bridge = createAnalysisBridge();
	setContext(ANALYSIS_BRIDGE_KEY, bridge);

	// Width of the AI assistant panel (resizable by dragging, remembered in localStorage; same pattern as /simulators/[id])
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
			// Since the panel is on the right, dragging further left makes it wider
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
	<!-- ARIA Window Splitter pattern (https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/):
	     role="separator" + tabindex + key handling is a correct combination that the a11y lint for
	     non-interactive elements can't detect on its own -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="resize-handle"
		class:active={resizing}
		role="separator"
		aria-orientation="vertical"
		aria-label="Adjust AI assistant width"
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
