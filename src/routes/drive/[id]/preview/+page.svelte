<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';

	let { data }: { data: PageData } = $props();

	function parentDir(p: string) {
		if (p === '/' || !p.includes('/')) return '/';
		const idx = p.lastIndexOf('/');
		return idx <= 0 ? '/' : p.slice(0, idx);
	}

	const fileUrl = $derived(`/api/files/${data.drive.id}${data.path}`);
	const dlUrl = $derived(`${fileUrl}?dl=1`);
	const parentPath = $derived(parentDir(data.path));
	const filename = $derived(data.path.split('/').pop() || data.path);
</script>

<header class="flex items-center gap-3 border-b border-border bg-bg-secondary px-4 py-3">
	<a
		href={`/drive/${data.drive.id}?path=${encodeURIComponent(parentPath)}`}
		class="rounded px-2 py-1 font-mono text-[11px] text-text-secondary transition hover:text-accent"
	>
		◀ Back
	</a>
	<span class="flex-1 truncate font-mono text-[11px] text-text-primary">{filename}</span>

	{#if data.cached}
		<span
			class="rounded bg-accent/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-accent"
		>
			cached
		</span>
	{:else}
		<form method="POST" action="?/cache" use:enhance class="contents">
			<input type="hidden" name="file" value={data.path} />
			<button
				type="submit"
				class="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition hover:text-accent"
				title="Save to local cache"
			>
				⇩ Cache
			</button>
		</form>
	{/if}
	<a
		href={dlUrl}
		download={filename}
		class="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition hover:text-accent"
	>
		Download
	</a>
</header>

<section class="flex flex-1 items-center justify-center overflow-hidden p-4">
	{#if data.kind === 'video'}
		<video src={fileUrl} controls autoplay class="max-h-full max-w-full bg-black"></video>
	{:else if data.kind === 'audio'}
		<audio src={fileUrl} controls autoplay class="w-full max-w-2xl"></audio>
	{:else if data.kind === 'image'}
		<img src={fileUrl} alt={filename} class="max-h-full max-w-full object-contain" />
	{:else if data.kind === 'text' && data.isEmpty}
		<p class="font-mono text-xs uppercase tracking-wider text-text-muted">Empty file</p>
	{:else if data.kind === 'text' && data.isBinary}
		<p class="font-mono text-xs uppercase tracking-wider text-text-muted">Binary file</p>
	{:else if data.kind === 'text' && data.textPreview != null}
		<pre
			class="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-bg-secondary p-4 font-mono text-xs leading-relaxed text-text-primary">{data.textPreview}</pre>
	{:else}
		<p class="font-mono text-xs uppercase tracking-wider text-text-muted">
			Preview not supported — use Download
		</p>
	{/if}
</section>
