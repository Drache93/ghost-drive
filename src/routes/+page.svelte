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
			class="border-border bg-bg-secondary w-96 space-y-4 rounded-lg border p-6"
		>
			<h2 class="text-accent font-mono text-xs tracking-[3px] uppercase">New Drive</h2>
			<label class="block">
				<span class="text-text-secondary mb-1 block font-mono text-[10px] tracking-wider uppercase">
					Name
				</span>
				<input
					name="name"
					type="text"
					required
					class="border-border bg-bg-tertiary text-text-primary focus:border-accent-dim w-full rounded border px-3 py-2 font-mono text-xs outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-text-secondary mb-1 block font-mono text-[10px] tracking-wider uppercase">
					Icon (optional)
				</span>
				<input
					name="icon"
					type="file"
					accept="image/*"
					class="text-text-secondary w-full font-mono text-xs"
				/>
			</label>
			{#if form?.missing}
				<p class="text-danger font-mono text-[10px]">Name is required</p>
			{/if}
			<div class="flex justify-end gap-2">
				<a
					href="/"
					class="text-text-secondary hover:text-text-primary rounded px-3 py-2 font-mono text-[10px] tracking-wider uppercase"
				>
					Cancel
				</a>
				<button
					type="submit"
					class="bg-accent text-bg-primary rounded px-4 py-2 font-mono text-[10px] tracking-wider uppercase hover:brightness-110"
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
			class="border-border bg-bg-secondary w-96 space-y-4 rounded-lg border p-6"
		>
			<h2 class="text-accent font-mono text-xs tracking-[3px] uppercase">Accept Invite</h2>
			<label class="block">
				<span class="text-text-secondary mb-1 block font-mono text-[10px] tracking-wider uppercase">
					Invite URL
				</span>
				<input
					name="url"
					type="text"
					required
					placeholder="ghostdrive://..."
					class="border-border bg-bg-tertiary text-text-primary focus:border-accent-dim w-full rounded border px-3 py-2 font-mono text-xs outline-none"
				/>
			</label>
			{#if form?.error}
				<p class="text-danger font-mono text-[10px]">{form.error}</p>
			{/if}
			<div class="flex justify-end gap-2">
				<a
					href="/"
					class="text-text-secondary hover:text-text-primary rounded px-3 py-2 font-mono text-[10px] tracking-wider uppercase"
				>
					Cancel
				</a>
				<button
					type="submit"
					class="bg-accent text-bg-primary rounded px-4 py-2 font-mono text-[10px] tracking-wider uppercase hover:brightness-110"
				>
					Join
				</button>
			</div>
		</form>
	{:else}
		<div class="text-center">
			<p class="text-text-muted font-mono text-xs tracking-[3px] uppercase">
				Select or create a drive
			</p>
		</div>
	{/if}
</div>
