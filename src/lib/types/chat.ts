export type FieldType =
	| 'text'
	| 'email'
	| 'tel'
	| 'number'
	| 'textarea'
	| 'select'
	| 'date'
	| 'datetime-local'
	| 'hidden'
	| 'recordSelect'
	| 'multiselect';

export type FormField = {
	key: string;
	label: string;
	type: FieldType;
	required?: boolean;
	placeholder?: string;
	value?: string;
	options?: { label: string; value: string }[];
	refTable?: string;
};

export type TableColumn = {
	key: string;
	label: string;
};

export type TextContent = {
	type: 'text';
	text: string;
};

export type FormContent = {
	type: 'form';
	title?: string;
	fields: FormField[];
	tool: string;
	entity?: string;
	submitLabel?: string;
	completed?: boolean;
};

export type TableContent = {
	type: 'table';
	columns: TableColumn[];
	rows: Record<string, unknown>[];
	entity?: string;
};

export type ActionItem = {
	id: string;
	label: string;
	description?: string;
};

export type ActionContent = {
	type: 'actions';
	title?: string;
	actions: ActionItem[];
};

export type ValueFormat = 'currency' | 'number' | 'date' | 'datetime' | 'text';

export type ValueItem = {
	label: string;
	value: string | number | null;
	format: ValueFormat;
};

export type ValuesContent = {
	type: 'values';
	title?: string;
	items: ValueItem[];
};

export type ChartSeries = { name: string; data: { label: string; value: number }[] };

export type ChartContent = {
	type: 'chart';
	chartType: 'bar' | 'line' | 'pie';
	title?: string;
	mode?: 'normal' | 'stacked' | 'grouped';
	data?: { label: string; value: number }[];
	series?: ChartSeries[];
};

export type LinkContent = {
	type: 'link';
	label: string;
	href: string;
	description?: string;
	newTab?: boolean;
};

export type ReplyOption = {
	value: string;
	label: string;
};

export type ReplyField = {
	key: string;
	type: 'single' | 'multiple' | 'text' | 'number' | 'datetime';
	label?: string;
	options?: ReplyOption[];
	placeholder?: string;
};

export type ReplyContent = {
	type: 'reply';
	title?: string;
	fields: ReplyField[];
	submitLabel?: string;
	completed?: boolean;
};

export type SimulatorFeature = {
	key: string;
	label: string;
	coefficient: number;
	min: number;
	max: number;
	mean: number;
};

export type SimulatorMetrics = {
	r2: number;
	adjustedR2: number;
	sampleSize: number;
	residualStdError: number;
};

export type SimulatorContent = {
	type: 'simulator';
	simulatorId: string;
	name: string;
	description?: string;
	targetLabel: string;
	intercept: number;
	features: SimulatorFeature[];
	metrics: SimulatorMetrics;
};

export type MessageContent =
	| TextContent
	| FormContent
	| TableContent
	| ActionContent
	| ValuesContent
	| ChartContent
	| SimulatorContent
	| LinkContent
	| ReplyContent;

export type Message = {
	id: string;
	role: 'user' | 'assistant';
	contents: MessageContent[];
	createdAt: Date;
};
