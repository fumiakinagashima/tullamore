<script lang="ts">
	import { tick } from 'svelte';
	import MoreVertical from '$lib/components/icon/MoreVertical.svelte';

	type CellType = 'text' | 'number' | 'date' | 'select';

	type GridColumn = {
		key: string;
		label: string;
		type?: CellType;
		options?: { value: string; label: string }[];
		width?: number;
		readonly?: boolean;
	};

	type GridRow = Record<string, string | number | null>;

	type Props = {
		columns: GridColumn[];
		rows?: GridRow[];
		addable?: boolean;
		deletable?: boolean;
		onchange?: (rows: GridRow[]) => void;
		/** When set, fixes the table height at this value (px) and vertically scrolls overflowing rows (unlimited height as before when unset) */
		maxHeight?: number;
	};

	const DEFAULT_COLUMN_WIDTH = 160;

	let {
		columns,
		rows = $bindable([]),
		addable = true,
		deletable = true,
		onchange,
		maxHeight
	}: Props = $props();

	// Cells are always rendered as input/select elements (never swapped for a span when not editing).
	// Switching the element type would cause the table's auto-layout to recompute column widths and
	// jitter on every click
	let active = $state<{ row: number; col: number } | null>(null);

	// Lookup table used to actually move focus to the next cell when navigating by keyboard (Tab/Enter)
	let cellEls: (HTMLInputElement | HTMLSelectElement | null)[][] = [];

	let scrollEl: HTMLDivElement | undefined = $state();

	function registerCell(node: HTMLInputElement | HTMLSelectElement, pos: { ri: number; ci: number }) {
		(cellEls[pos.ri] ??= [])[pos.ci] = node;
		return {
			destroy() {
				if (cellEls[pos.ri]?.[pos.ci] === node) cellEls[pos.ri][pos.ci] = null;
			}
		};
	}

	function updateCell(ri: number, key: string, val: string | number | null) {
		rows = rows.map((row, i) => (i === ri ? { ...row, [key]: val } : row));
		onchange?.(rows);
	}

	function navigate(ri: number, ci: number, dRow: number, dCol: number) {
		const nextRi = ri + dRow;
		const nextCi = ci + dCol;
		if (nextCi >= 0 && nextCi < columns.length && nextRi >= 0 && nextRi < rows.length) {
			cellEls[nextRi]?.[nextCi]?.focus();
		} else {
			(document.activeElement as HTMLElement | null)?.blur();
		}
	}

	function handleKeydown(e: KeyboardEvent, ri: number, ci: number) {
		if (e.key === 'Tab') {
			e.preventDefault();
			const nextCi = e.shiftKey ? ci - 1 : ci + 1;
			if (nextCi >= 0 && nextCi < columns.length) {
				navigate(ri, ci, 0, e.shiftKey ? -1 : 1);
			} else if (!e.shiftKey && ri < rows.length - 1) {
				cellEls[ri + 1]?.[0]?.focus();
			} else if (e.shiftKey && ri > 0) {
				cellEls[ri - 1]?.[columns.length - 1]?.focus();
			} else {
				(document.activeElement as HTMLElement | null)?.blur();
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			navigate(ri, ci, 1, 0);
		} else if (e.key === 'Escape') {
			(document.activeElement as HTMLElement | null)?.blur();
		}
	}

	function blankRow(): GridRow {
		return Object.fromEntries(columns.map((c) => [c.key, c.type === 'number' ? 0 : '']));
	}

	async function addRow() {
		rows = [...rows, blankRow()];
		onchange?.(rows);
		// When maxHeight makes this a scroll area, the new row could be added out of view and easy to
		// miss, so scroll all the way to the bottom
		await tick();
		if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
	}

	function deleteRow(i: number) {
		rows = rows.filter((_, idx) => idx !== i);
		if (active) {
			if (active.row === i) active = null;
			else if (active.row > i) active = { ...active, row: active.row - 1 };
		}
		onchange?.(rows);
	}

	// Row menu (copy/paste/insert row/delete). The clipboard is simple internal state scoped to this grid only
	let openRowMenu = $state<number | null>(null);
	let clipboardRow = $state<GridRow | null>(null);

	function toggleRowMenu(i: number) {
		openRowMenu = openRowMenu === i ? null : i;
	}

	function copyRow(i: number) {
		clipboardRow = { ...rows[i] };
		openRowMenu = null;
	}

	function pasteRow(i: number) {
		if (!clipboardRow) return;
		const pasted = clipboardRow;
		rows = rows.map((row, idx) => (idx === i ? { ...pasted } : row));
		onchange?.(rows);
		openRowMenu = null;
	}

	function insertRowAt(i: number) {
		rows = [...rows.slice(0, i), blankRow(), ...rows.slice(i)];
		onchange?.(rows);
		openRowMenu = null;
	}

	$effect(() => {
		if (openRowMenu === null) return;
		const close = () => (openRowMenu = null);
		const id = setTimeout(() => document.addEventListener('click', close), 0);
		return () => {
			clearTimeout(id);
			document.removeEventListener('click', close);
		};
	});
</script>

<div class="grid-wrap">
	<div class="scroll" bind:this={scrollEl} style:max-height={maxHeight ? `${maxHeight}px` : undefined}>
		<table>
			<thead>
				<tr>
					{#if deletable}<th class="ctrl-th"></th>{/if}
					{#each columns as col}
						<th style:width="{col.width ?? DEFAULT_COLUMN_WIDTH}px">{col.label}</th>
					{/each}
					<th class="filler-th"></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row, ri}
					<tr>
						{#if deletable}
							<td class="ctrl-td">
								<button
									type="button"
									class="row-menu-btn"
									aria-label="Row menu"
									aria-expanded={openRowMenu === ri}
									onclick={(e) => {
										e.stopPropagation();
										toggleRowMenu(ri);
									}}
								>
									<MoreVertical size={14} />
								</button>
								{#if openRowMenu === ri}
									<div class="row-menu">
										<button class="row-menu-item" onclick={() => copyRow(ri)}>Copy</button>
										<button class="row-menu-item" disabled={!clipboardRow} onclick={() => pasteRow(ri)}>Paste</button>
										<button class="row-menu-item" onclick={() => insertRowAt(ri)}>Insert row</button>
										<button class="row-menu-item danger" onclick={() => deleteRow(ri)}>Delete</button>
									</div>
								{/if}
							</td>
						{/if}
						{#each columns as col, ci}
							{@const isActive = active?.row === ri && active?.col === ci}
							<td class:active-cell={isActive} class:readonly={col.readonly} style:width="{col.width ?? DEFAULT_COLUMN_WIDTH}px">
								{#if col.type === 'select' && col.options}
									<select
										use:registerCell={{ ri, ci }}
										value={String(row[col.key] ?? '')}
										disabled={col.readonly}
										onfocus={() => (active = { row: ri, col: ci })}
										onchange={(e) => updateCell(ri, col.key, (e.currentTarget as HTMLSelectElement).value)}
										onkeydown={(e) => handleKeydown(e, ri, ci)}
										onblur={() => (active = null)}
									>
										{#each col.options as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</select>
								{:else}
									<input
										use:registerCell={{ ri, ci }}
										type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
										value={String(row[col.key] ?? '')}
										readonly={col.readonly}
										tabindex={col.readonly ? -1 : 0}
										onfocus={() => (active = { row: ri, col: ci })}
										onkeydown={(e) => handleKeydown(e, ri, ci)}
										onblur={(e) => {
											active = null;
											const v = (e.currentTarget as HTMLInputElement).value;
											updateCell(ri, col.key, col.type === 'number' ? (Number(v) || 0) : v);
										}}
									/>
								{/if}
							</td>
						{/each}
						<td class="filler-td"></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if addable}
		<button type="button" class="add-row" onclick={addRow}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			Add row
		</button>
	{/if}
</div>

<style lang="scss">
	.grid-wrap { display: flex; flex-direction: column; gap: 0; }

	.scroll {
		overflow-x: auto;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: 8px 8px 0 0;
	}

	table {
		width: auto;
		border-collapse: collapse;
		font-size: 0.9375rem;
	}

	/* Sticky so column headers stay visible when scrolling with maxHeight set (inert and has no side effect when unset) */
	thead {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--color-surface);
	}

	th {
		padding: 8px 12px;
		text-align: left;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
		user-select: none;
	}

	.ctrl-th { width: 32px; }
	/* When the total column width is narrower than the container, show the right side as borderless whitespace (don't force-stretch the table) */
	.filler-th, .filler-td { border: none; }

	td {
		padding: 0;
		border-bottom: 1px solid var(--color-border);
		border-right: 1px solid var(--color-border);
		position: relative;
		cursor: cell;
	}
	td.filler-td { border-right: none; }
	tr:last-child td { border-bottom: none; }

	td.readonly { cursor: default; background: color-mix(in srgb, var(--color-border) 30%, transparent); }

	td:not(.active-cell):not(.readonly):hover { background: var(--color-surface); }

	td.active-cell {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
		z-index: 1;
	}

	/* Always render input/select, hiding the border/background when inactive to look like plain text
	   (the DOM element type itself never switches between active/inactive, avoiding column-width jitter on every click) */
	td input,
	td select {
		display: block;
		width: 100%;
		height: 37px;
		padding: 0 12px;
		border: none;
		background: transparent;
		color: var(--color-text);
		font-size: 0.9375rem;
		font-family: inherit;
		outline: none;
		cursor: cell;
	}

	td.readonly input {
		cursor: default;
		color: var(--color-text-muted);
	}

	td select { cursor: pointer; }
	td.readonly select { cursor: default; }

	td.active-cell input,
	td.active-cell select {
		background: var(--color-background);
		cursor: text;
	}

	td.active-cell select { cursor: pointer; }

	.ctrl-td {
		cursor: default;
		border-right: none;
		width: 32px;
		position: relative;
	}

	.row-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: 37px;
		padding: 0 6px;
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s, background 0.1s ease;

		&:hover, &[aria-expanded='true'] { color: var(--color-text); background: var(--color-border); }
	}

	tr:hover .row-menu-btn { opacity: 1; }

	.row-menu {
		position: absolute;
		top: calc(100% + 2px);
		left: 0;
		min-width: 110px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.08),
			0 1px 4px rgba(0, 0, 0, 0.04);
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		z-index: 20;
	}

	.row-menu-item {
		display: block;
		width: 100%;
		padding: 7px 10px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-text);
		font-size: 0.8125rem;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;

		&:hover { background: var(--color-background); }
		&:disabled { color: var(--color-text-muted); cursor: not-allowed; }
		&.danger { color: var(--color-danger); }
	}

	.add-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 1px solid var(--color-border);
		border-top: none;
		border-radius: 0 0 8px 8px;
		background: var(--color-surface);
		color: var(--color-text-muted);
		font-size: 0.875rem;
		cursor: pointer;
		width: 100%;
		transition: background 0.15s, color 0.15s;
	}
	.add-row:hover { background: var(--color-border); color: var(--color-text); }
	.add-row svg { width: 14px; height: 14px; }
</style>
