<script lang="ts">
	type Column = { key: string; label: string };

	type Props = {
		columns: Column[];
		/** matrix[i][j] = correlation coefficient between columns[i] and columns[j] (-1 to 1) */
		matrix: number[][];
	};

	let { columns, matrix }: Props = $props();

	// Diverging color scale: negative correlation = blue (--color-info), positive correlation = orange (--chart-2), 0 = neutral.
	// Colors are kept as a light fill (at most semi-transparent), on the assumption that text is
	// always drawn in --color-text, to ensure text contrast (pre-verified to not fall below 4.5:1).
	const MAX_ALPHA = 0.45;
	const NEGATIVE_RGB = '37, 99, 235'; // --color-info
	const POSITIVE_RGB = '245, 158, 11'; // --chart-2

	function cellBackground(value: number, isDiagonal: boolean): string {
		if (isDiagonal) return 'transparent';
		const alpha = Math.min(1, Math.abs(value)) * MAX_ALPHA;
		const rgb = value >= 0 ? POSITIVE_RGB : NEGATIVE_RGB;
		return `rgba(${rgb}, ${alpha})`;
	}

	function fmt(v: number): string {
		return v.toFixed(2);
	}
</script>

<div class="heatmap">
	<div class="grid" style:grid-template-columns="120px repeat({columns.length}, 1fr)">
		<div class="corner"></div>
		{#each columns as col (col.key)}
			<div class="col-label" title={col.label}>{col.label}</div>
		{/each}
		{#each columns as rowCol, i (rowCol.key)}
			<div class="row-label" title={rowCol.label}>{rowCol.label}</div>
			{#each columns as colCol, j (colCol.key)}
				<div
					class="cell"
					class:diagonal={i === j}
					style:background={cellBackground(matrix[i][j], i === j)}
					title="{rowCol.label} × {colCol.label}: {fmt(matrix[i][j])}"
				>
					{fmt(matrix[i][j])}
				</div>
			{/each}
		{/each}
	</div>

	<div class="legend">
		<span class="legend-label">-1</span>
		<div class="legend-bar"></div>
		<span class="legend-label">0</span>
		<div class="legend-bar positive"></div>
		<span class="legend-label">+1</span>
	</div>
</div>

<style lang="scss">
	.heatmap {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.grid {
		display: grid;
		gap: 2px;
		overflow-x: auto;
	}

	.corner {
		background: transparent;
	}

	.col-label,
	.row-label {
		display: flex;
		align-items: center;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		padding: 4px 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col-label {
		justify-content: center;
		text-align: center;
		writing-mode: horizontal-tb;
	}

	.cell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		border-radius: 4px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text);
		background: var(--color-background);

		&.diagonal {
			color: var(--color-text-muted);
			font-weight: 400;
		}
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.legend-label {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}

	.legend-bar {
		width: 60px;
		height: 8px;
		border-radius: 4px;
		background: linear-gradient(to right, rgba(37, 99, 235, 0.45), rgba(37, 99, 235, 0));

		&.positive {
			background: linear-gradient(to right, rgba(245, 158, 11, 0), rgba(245, 158, 11, 0.45));
		}
	}
</style>
