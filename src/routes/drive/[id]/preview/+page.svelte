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

<header class="border-border bg-bg-secondary flex items-center gap-3 border-b px-4 py-3">
	<a
		href={`/drive/${data.drive.id}?path=${encodeURIComponent(parentPath)}`}
		class="text-text-secondary hover:text-accent rounded px-2 py-1 font-mono text-[11px] transition"
	>
		◀ Back
	</a>
	<span class="text-text-primary flex-1 truncate font-mono text-[11px]">{filename}</span>

	{#if data.cached}
		<span
			class="bg-accent/10 text-accent rounded px-2 py-1 font-mono text-[10px] tracking-wider uppercase"
		>
			cached
		</span>
	{:else}
		<form method="POST" action="?/cache" use:enhance class="contents">
			<input type="hidden" name="file" value={data.path} />
			<button
				type="submit"
				class="text-text-secondary hover:text-accent rounded px-2 py-1 font-mono text-[10px] tracking-wider uppercase transition"
				title="Save to local cache"
			>
				⇩ Cache
			</button>
		</form>
	{/if}
	<a
		href={dlUrl}
		download={filename}
		class="text-text-secondary hover:text-accent rounded px-2 py-1 font-mono text-[10px] tracking-wider uppercase transition"
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
		<p class="text-text-muted font-mono text-xs tracking-wider uppercase">Empty file</p>
	{:else if data.kind === 'text' && data.isBinary}
		<p class="text-text-muted font-mono text-xs tracking-wider uppercase">Binary file</p>
	{:else if data.kind === 'text' && data.textPreview != null}
		<pre
			class="border-border bg-bg-secondary text-text-primary h-full w-full overflow-auto rounded border p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{data.textPreview}</pre>
	{:else}
		<p class="text-text-muted font-mono text-xs tracking-wider uppercase">
			Preview not supported — use Download
		</p>
	{/if}
</section>
