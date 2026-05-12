<script lang="ts">
	let {
		name,
		isFolder,
		cached,
		peers = 1,
		isGuest = false,
		href
	}: {
		name: string;
		isFolder: boolean;
		cached?: boolean;
		peers?: number;
		isGuest?: boolean;
		href: string;
	} = $props();

	const offline = $derived(isGuest && peers === 0 && !isFolder && !cached);

	const ext = $derived(name.split('.').pop()?.toLowerCase() ?? '');
	const fileKind = $derived(detectKind(ext));

	function detectKind(e: string): 'video' | 'audio' | 'image' | 'doc' | 'code' | 'generic' {
		if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(e)) return 'video';
		if (['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(e)) return 'audio';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return 'image';
		if (['pdf', 'txt', 'md'].includes(e)) return 'doc';
		if (['js', 'ts', 'json', 'html', 'css', 'sh', 'py', 'go', 'rs'].includes(e)) return 'code';
		return 'generic';
	}
</script>

<a
	{href}
	class="group hover:bg-bg-hover relative flex flex-col items-center gap-2 rounded-md p-3 transition"
	class:opacity-40={offline}
	title={offline ? 'Not available offline' : undefined}
>
	<div class="text-accent-dim relative flex h-12 w-12 items-center justify-center">
		{#if isFolder}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				class="h-10 w-10"
			>
				<path d="M2 4h4l1.5 1.5H14V13H2z" />
			</svg>
		{:else if fileKind === 'video'}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				class="h-10 w-10"
			>
				<rect x="2" y="3" width="12" height="10" rx="1" />
				<path d="M7 6l3 2-3 2z" fill="currentColor" />
			</svg>
		{:else if fileKind === 'audio'}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				class="h-10 w-10"
			>
				<path d="M6 3v8a2 2 0 11-2-2h2" />
				<path d="M6 3l8-1v9a2 2 0 11-2-2h2" />
			</svg>
		{:else if fileKind === 'image'}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				class="h-10 w-10"
			>
				<rect x="2" y="2" width="12" height="12" />
				<circle cx="6" cy="6" r="1.5" fill="currentColor" />
				<path d="M2 12l4-4 8 4" />
			</svg>
		{:else if fileKind === 'code'}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				class="h-10 w-10"
			>
				<path d="M5 5L2 8l3 3M11 5l3 3-3 3M9 3l-2 10" />
			</svg>
		{:else if fileKind === 'doc'}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				class="h-10 w-10"
			>
				<path d="M3 2h7l3 3v9H3z" />
				<path d="M10 2v3h3" />
			</svg>
		{:else}
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				class="h-10 w-10"
			>
				<path d="M3 2h7l3 3v9H3z" />
			</svg>
		{/if}
		{#if cached}
			<span
				class="bg-accent absolute top-0 right-0 h-2 w-2 rounded-full shadow-[0_0_4px_var(--color-accent)]"
				title="cached"
			></span>
		{/if}
	</div>
	<span class="text-text-primary line-clamp-2 text-center text-[11px] leading-tight">{name}</span>
</a>
