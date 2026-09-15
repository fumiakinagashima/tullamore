// A signal for resetting the chat screen's state when "New chat" is clicked.
// Since +page.svelte holds client-side in-memory state, navigating to the same "/" route causes
// SvelteKit to reuse the component instance instead of resetting it automatically
class ChatSessionStore {
	resetToken = $state(0);

	startNew() {
		this.resetToken++;
	}
}

export const chatSession = new ChatSessionStore();
