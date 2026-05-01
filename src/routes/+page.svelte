<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { form }: { form: ActionData } = $props();

	const action = $derived(page.url.searchParams.get('action'));
</script>

<div class="flex flex-1 items-center justify-center">
	{#if action === 'new'}
		<form
			method="POST"
			action="?/create"
			enctype="multipart/form-data"
			use:enhance
			class="w-96 space-y-4 rounded-lg border border-border bg-bg-secondary p-6"
		>
			<h2 class="font-mono text-xs uppercase tracking-[3px] text-accent">New Drive</h2>
			<label class="block">
				<span class="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-secondary">
					Name
				</span>
				<input
					name="name"
					type="text"
					required
					class="w-full rounded border border-border bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent-dim"
				/>
			</label>
			<label class="block">
				<span class="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-secondary">
					Icon (optional)
				</span>
				<input
					name="icon"
					type="file"
					accept="image/*"
					class="w-full font-mono text-xs text-text-secondary"
				/>
			</label>
			{#if form?.missing}
				<p class="font-mono text-[10px] text-danger">Name is required</p>
			{/if}
			<div class="flex justify-end gap-2">
				<a
					href="/"
					class="rounded px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:text-text-primary"
				>
					Cancel
				</a>
				<button
					type="submit"
					class="rounded bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-bg-primary hover:brightness-110"
				>
					Create
				</button>
			</div>
		</form>
	{:else if action === 'join'}
		<form
			method="POST"
			action="?/accept"
			use:enhance
			class="w-96 space-y-4 rounded-lg border border-border bg-bg-secondary p-6"
		>
			<h2 class="font-mono text-xs uppercase tracking-[3px] text-accent">Accept Invite</h2>
			<label class="block">
				<span class="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-secondary">
					Invite URL
				</span>
				<input
					name="url"
					type="text"
					required
					placeholder="ghostdrive://..."
					class="w-full rounded border border-border bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent-dim"
				/>
			</label>
			{#if form?.error}
				<p class="font-mono text-[10px] text-danger">{form.error}</p>
			{/if}
			<div class="flex justify-end gap-2">
				<a
					href="/"
					class="rounded px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:text-text-primary"
				>
					Cancel
				</a>
				<button
					type="submit"
					class="rounded bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-bg-primary hover:brightness-110"
				>
					Join
				</button>
			</div>
		</form>
	{:else}
		<div class="text-center">
			<p class="font-mono text-xs uppercase tracking-[3px] text-text-muted">
				Select or create a drive
			</p>
		</div>
	{/if}
</div>
