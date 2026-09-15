<script lang="ts">
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import DatePicker from '$lib/components/ui/DatePicker.svelte';
	import MultiSelect from '$lib/components/ui/MultiSelect.svelte';
	import SingleSelect from '$lib/components/ui/SingleSelect.svelte';
	import FileUpload from '$lib/components/ui/FileUpload.svelte';
	import Table from '$lib/components/ui/Table.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import List from '$lib/components/ui/List.svelte';
	import BarChart from '$lib/components/ui/BarChart.svelte';
	import LineChart from '$lib/components/ui/LineChart.svelte';
	import PieChart from '$lib/components/ui/PieChart.svelte';
	import ScatterChart from '$lib/components/ui/ScatterChart.svelte';
	import ActionSelector from '$lib/components/chat/ActionSelector.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import TimePicker from '$lib/components/ui/TimePicker.svelte';
	import DateTimePicker from '$lib/components/ui/DateTimePicker.svelte';
	import NumberInput from '$lib/components/ui/NumberInput.svelte';
	import DataGrid from '$lib/components/ui/DataGrid.svelte';
	import Chart from '$lib/components/chat/Chart.svelte';
	import TypingIndicator from '$lib/components/ui/TypingIndicator.svelte';
	
	let text = $state('');
	let memo = $state('');
	let status = $state('');
	let toggled = $state(false);
	let date = $state('');
	let tags = $state<string[]>([]);
	let priority = $state('');
	let paginationPage = $state(1);
	let selectedAction = $state('');

	let searchSelectVal = $state('');
	let timeVal = $state('');
	let datetimeVal = $state('');
	let numVal = $state(0);

	type GridRow = Record<string, string | number | null>;
	let gridRows = $state<GridRow[]>([
		{ name: 'Alex Johnson', dept: 'sales', age: 32, joined: '2022-04-01' },
		{ name: 'Jamie Lee', dept: 'eng', age: 28, joined: '2023-09-15' }
	]);

	const searchOptions = [
		{ value: 'jp', label: 'Japan' },
		{ value: 'us', label: 'United States' },
		{ value: 'gb', label: 'United Kingdom' },
		{ value: 'de', label: 'Germany' },
		{ value: 'fr', label: 'France' },
		{ value: 'cn', label: 'China' },
		{ value: 'kr', label: 'South Korea' },
		{ value: 'au', label: 'Australia' }
	];

	const gridColumns = [
		{ key: 'name', label: 'Name', width: 160 },
		{ key: 'dept', label: 'Department', type: 'select' as const, width: 140, options: [
			{ value: 'sales', label: 'Sales' },
			{ value: 'eng', label: 'Engineer' },
			{ value: 'hr', label: 'HR' },
			{ value: 'finance', label: 'Finance' }
		]},
		{ key: 'age', label: 'Age', type: 'number' as const, width: 90 },
		{ key: 'joined', label: 'Join date', width: 130 }
	];

	const statusOptions = [
		{ value: 'lead', label: 'Lead' },
		{ value: 'active', label: 'Active' },
		{ value: 'inactive', label: 'Inactive' }
	];

	const tagOptions = [
		{ value: 'vip', label: 'VIP' },
		{ value: 'partner', label: 'Partner' },
		{ value: 'prospect', label: 'Prospect' },
		{ value: 'support', label: 'Support' }
	];

	const priorityOptions = [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' }
	];

	const tableColumns = [
		{ key: 'name', label: 'Company name', sortable: true },
		{ key: 'contact', label: 'Contact', sortable: true },
		{ key: 'status', label: 'Status' },
		{ key: 'revenue', label: 'Revenue', sortable: true }
	];

	const tableRows = [
		{ name: 'Acme Inc.', contact: 'Alex Johnson', status: 'Active', revenue: '$1,200,000' },
		{ name: 'Test Trading LLC', contact: 'Jamie Lee', status: 'Lead', revenue: '$380,000' },
		{ name: 'Sample Corp.', contact: 'Sam Patel', status: 'Inactive', revenue: '$0' },
		{ name: 'Future Inc.', contact: 'Taylor Kim', status: 'Active', revenue: '$2,850,000' }
	];

	type Customer = { name: string; contact: string; status: string };
	const listItems: Customer[] = [
		{ name: 'Acme Inc.', contact: 'Alex Johnson', status: 'Active' },
		{ name: 'Test Trading LLC', contact: 'Jamie Lee', status: 'Lead' },
		{ name: 'Sample Corp.', contact: 'Sam Patel', status: 'Inactive' }
	];

	const barData = [
		{ label: 'Jan', value: 120 },
		{ label: 'Feb', value: 85 },
		{ label: 'Mar', value: 200 },
		{ label: 'Apr', value: 160 },
		{ label: 'May', value: 240 },
		{ label: 'Jun', value: 195 }
	];

	const lineData = [
		{ label: 'Q1', value: 405 },
		{ label: 'Q2', value: 595 },
		{ label: 'Q3', value: 520 },
		{ label: 'Q4', value: 780 }
	];

	const pieData = [
		{ label: 'Active', value: 58 },
		{ label: 'Lead', value: 27 },
		{ label: 'Inactive', value: 15 }
	];

	const multiBarSeries = [
		{ name: 'New', data: [
			{ label: 'Jan', value: 45 }, { label: 'Feb', value: 30 }, { label: 'Mar', value: 80 },
			{ label: 'Apr', value: 60 }, { label: 'May', value: 90 }, { label: 'Jun', value: 70 }
		]},
		{ name: 'Renewal', data: [
			{ label: 'Jan', value: 75 }, { label: 'Feb', value: 55 }, { label: 'Mar', value: 120 },
			{ label: 'Apr', value: 100 }, { label: 'May', value: 150 }, { label: 'Jun', value: 125 }
		]}
	];

	const multiLineSeries = [
		{ name: 'Revenue', data: [
			{ label: 'Q1', value: 405 }, { label: 'Q2', value: 595 }, { label: 'Q3', value: 520 }, { label: 'Q4', value: 780 }
		]},
		{ name: 'Target', data: [
			{ label: 'Q1', value: 450 }, { label: 'Q2', value: 550 }, { label: 'Q3', value: 600 }, { label: 'Q4', value: 700 }
		]},
		{ name: 'Prior year', data: [
			{ label: 'Q1', value: 320 }, { label: 'Q2', value: 410 }, { label: 'Q3', value: 480 }, { label: 'Q4', value: 560 }
		]}
	];

	// Intentionally use a range offset from 0 (simulating data like ad spend, to prevent regressions of the bug where 0 got included on the axis)
	const scatterData = [
		{ x: 68000, y: 897000 }, { x: 83000, y: 950000 }, { x: 98000, y: 1002000 },
		{ x: 113000, y: 1055000 }, { x: 128000, y: 1108000 }, { x: 143000, y: 1160000 },
		{ x: 158000, y: 1213000 }
	];

</script>

<div class="page">
	<h1>UI Components</h1>
	<!-- Loading -->
	<section>
		<h2>Loading</h2>
		<div class="grid2">
			<TypingIndicator />
		</div>
	</section>

	<!-- Form input -->
	<section>
		<h2>Form input</h2>
		<div class="grid2">
			<Textbox label="Company name" bind:value={text} placeholder="Inc..." required />
			<Textbox label="Email" bind:value={text} type="email" placeholder="info@example.com" />
			<Textarea label="Memo" bind:value={memo} placeholder="Free text..." rows={3} />
			<Select label="Status" bind:value={status} options={statusOptions} />
			<DatePicker label="Contract date" bind:value={date} />
			<Textbox label="Error state" bind:value={text} error="Please enter a value" />
		</div>
	</section>

	<!-- Selection controls -->
	<section>
		<h2>Selection controls</h2>
		<div class="stack">
			<Toggle label="Receive email notifications" bind:checked={toggled} />
			<p class="val">Toggle: {toggled}</p>
			<MultiSelect label="Tags (multiple selection)" bind:value={tags} options={tagOptions} />
			<p class="val">Selected: {tags.join(', ') || 'None'}</p>
			<SingleSelect label="Priority (single selection)" bind:value={priority} options={priorityOptions} />
			<p class="val">Selected: {priority || 'None'}</p>
		</div>
	</section>

	<!-- Extended input controls -->
	<section>
		<h2>Extended input controls</h2>
		<div class="grid2">
			<SearchSelect label="Country (Select with search)" bind:value={searchSelectVal} options={searchOptions} />
			<p class="val val-bottom">Selected: {searchSelectVal || 'None'}</p>
			<TimePicker label="Time" bind:value={timeVal} />
			<DateTimePicker label="Date/time" bind:value={datetimeVal} />
			<NumberInput label="Quantity" bind:value={numVal} min={0} max={100} step={5} suffix="pcs" />
			<p class="val val-bottom">Value: {numVal}</p>
		</div>
	</section>

	<!-- Data grid -->
	<section>
		<h2>Data grid (spreadsheet-style)</h2>
		<DataGrid bind:rows={gridRows} columns={gridColumns} onchange={(r) => { gridRows = r; }} />
		<p class="val">{gridRows.length} rows</p>
	</section>

	<!-- File upload -->
	<section>
		<h2>File upload</h2>
		<div class="upload-wrap">
			<FileUpload label="Attachment" accept=".pdf,.xlsx,.csv" multiple />
		</div>
	</section>

	<!-- Table -->
	<section>
		<h2>Table (sort & pagination)</h2>
		<Table columns={tableColumns} rows={tableRows} pageSize={2} />
	</section>

	<!-- Pagination alone -->
	<section>
		<h2>Pagination</h2>
		<div class="stack">
			<Pagination bind:page={paginationPage} totalPages={12} />
			<p class="val">Current page: {paginationPage}</p>
		</div>
	</section>

	<!-- List -->
	<section>
		<h2>List (card view)</h2>
		<List items={listItems} columns={3}>
			{#snippet card(c)}
				<p class="card-name">{c.name}</p>
				<p class="card-sub">{c.contact}</p>
				<span class="badge">{c.status}</span>
			{/snippet}
		</List>
	</section>

	<!-- Action selector -->
	<section>
		<h2>Action selector (chat TUI)</h2>
		<div class="stack">
			<ActionSelector
				title="Select the next action"
				actions={[
					{ id: 'create', label: 'Register a customer', description: 'Enter new customer information in a form' },
					{ id: 'list', label: 'View customer list', description: 'Displays the list of registered customers' },
					{ id: 'report', label: 'View report', description: 'Displays the monthly revenue report' }
				]}
				onselect={(a) => selectedAction = a.label}
			/>
			{#if selectedAction}<p class="val">Selected: {selectedAction}</p>{/if}
		</div>
	</section>

	<!-- Charts -->
	<section>
		<h2>Charts</h2>
		<div class="grid2">
			<BarChart title="Revenue by month ($1,000s)" data={barData} />
			<LineChart title="Quarterly trend ($1,000s)" data={lineData} color="var(--chart-3)" />
		</div>
		<div class="pie-wrap">
			<PieChart title="Customer status distribution" data={pieData} />
		</div>
		<div class="chart-spacer">
			<ScatterChart title="Relationship between ad spend and revenue" xLabel="Ad spend" yLabel="Revenue" points={scatterData} />
		</div>
	</section>

	<!-- Multi-series charts -->
	<section>
		<h2>Charts (multi-series)</h2>
		<div class="grid2">
			<BarChart title="Revenue by month, grouped comparison" series={multiBarSeries} mode="grouped" />
			<BarChart title="Revenue by month, stacked" series={multiBarSeries} mode="stacked" />
		</div>
		<div class="chart-spacer">
			<LineChart title="Quarterly trend, multiple series" series={multiLineSeries} />
		</div>
	</section>

	<!-- Chart (chat wrapper) -->
	<section>
		<h2>Chart (AI chat wrapper)</h2>
		<div class="stack">
			<Chart chartType="bar" title="Revenue by month ($1,000s)" data={barData} />
			<Chart chartType="line" title="Quarterly trend ($1,000s)" data={lineData} />
			<Chart chartType="pie" title="Customer status distribution" data={pieData} />
			<Chart chartType="scatter" title="Relationship between ad spend and revenue" xLabel="Ad spend" yLabel="Revenue" points={scatterData} />
		</div>
	</section>

</div>

<style lang="scss">
	.page {
		padding: 32px 40px;
		max-width: 960px;
		display: flex;
		flex-direction: column;
		gap: 48px;
	}
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
	}
	section { display: flex; flex-direction: column; gap: 16px; }
	h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-muted);
		padding-bottom: 8px;
		border-bottom: 1px solid var(--color-border);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	.stack { display: flex; flex-direction: column; gap: 12px; }
	.row { display: flex; gap: 12px; }
	.val { font-size: 0.8125rem; color: var(--color-text-muted); }
	.val.error { color: var(--color-danger); }
	.val-bottom { align-self: end; padding-bottom: 10px; }
	.upload-wrap { max-width: 480px; }
	.pie-wrap { max-width: 420px; margin-top: 24px; }
	.chart-spacer { margin-top: 24px; }
	.btn-primary {
		padding: 7px 14px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.btn-primary:disabled { opacity: 0.6; cursor: default; }
	.btn-primary:hover:not(:disabled) { opacity: 0.9; }
	.card-name { font-weight: 600; margin-bottom: 4px; }
	.card-sub { font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 8px; }
	.badge {
		display: inline-block;
		font-size: 0.75rem;
		padding: 2px 8px;
		border-radius: 12px;
		background: var(--color-border);
		color: var(--color-text-muted);
	}
</style>
