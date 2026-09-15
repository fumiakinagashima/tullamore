import type { MessageContent } from '$lib/types/chat';

const MOCK_RESPONSES: MessageContent[][] = [
	[
		{ type: 'text', text: 'I will register the customer information. Please fill out the form below.' },
		{
			type: 'form',
			title: 'Customer Registration',
			tool: 'create_customer',
			fields: [
				{ key: 'name', label: 'Company Name', type: 'text', required: true, placeholder: 'Sample Corp' },
				{ key: 'email', label: 'Email Address', type: 'email', placeholder: 'taro@example.com' },
				{ key: 'phone', label: 'Phone Number', type: 'tel', placeholder: '03-0000-0000' },
				{ key: 'postal_code', label: 'Postal Code', type: 'text', placeholder: '100-0001' },
				{ key: 'address', label: 'Address', type: 'text', placeholder: 'Chiyoda-ku, Tokyo...' },
				{ key: 'website', label: 'Website', type: 'text', placeholder: 'https://example.com' },
				{
					key: 'status',
					label: 'Status',
					type: 'select',
					options: [
						{ value: 'lead', label: 'Lead' },
						{ value: 'active', label: 'Active' },
						{ value: 'inactive', label: 'Inactive' }
					]
				},
				{ key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Free-form notes' }
			]
		}
	],
	[
		{ type: 'text', text: 'Here is the list of registered customers.' },
		{
			type: 'table',
			columns: [
				{ key: 'name', label: 'Company Name' },
				{ key: 'email', label: 'Email' },
				{ key: 'status', label: 'Status' }
			],
			rows: [
				{ name: 'Acme Inc.', email: 'alex@acme.example.com', status: 'active' },
				{ name: 'Test Trading LLC', email: 'jamie@test.example.com', status: 'lead' },
				{ name: 'Sample Corp', email: 'sam@sample.example.com', status: 'inactive' }
			]
		}
	],
	[
		{ type: 'text', text: 'Hello! This is Tullamore. How can I help you?' },
		{
			type: 'actions',
			title: 'Please select an action',
			actions: [
				{ id: 'create', label: 'Register a customer', description: 'Enter new customer information via a form' },
				{ id: 'list', label: 'View customer list', description: 'Show the list of registered customers' },
				{ id: 'report', label: 'View report', description: 'Show the monthly sales report' }
			]
		}
	],
	[
		{ type: 'text', text: 'I have charted the monthly sales trend.' },
		{
			type: 'chart',
			chartType: 'line',
			title: 'Monthly Sales Trend',
			data: [
				{ label: 'Jan', value: 1200000 },
				{ label: 'Feb', value: 1450000 },
				{ label: 'Mar', value: 1380000 },
				{ label: 'Apr', value: 1620000 }
			]
		}
	]
];

let mockIndex = 0;

export function mockChat(): MessageContent[] {
	const contents = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length];
	mockIndex++;
	return contents;
}
