<script lang="ts">
	import FileItem from './FileItem.svelte';
	import logo from '$lib/assets/images/ghost.png';

	type Entry = { name: string; isFolder: boolean; cached?: boolean };

	let {
		driveId,
		path: dirPath,
		entries,
		peers = 0,
		isGuest = false
	}: {
		driveId: string;
		path: string;
		entries: Entry[];
		peers?: number;
		isGuest?: boolean;
	} = $props();

	function joinPath(name: string) {
		return dirPath === '/' ? '/' + name : `${dirPath}/${name}`;
	}
</script>

{#if entries.length === 0}
	<div class="flex h-full items-center justify-center">
		{#if peers === 0 && isGuest}
			<div class="flex flex-col items-center gap-3 text-center">
				<img src={logo} alt="" class="h-10 w-10 opacity-20" />
				<p class="text-text-muted font-mono text-xs tracking-wider uppercase">No cached files</p>
				<p class="text-text-muted font-mono text-[10px] leading-relaxed">
					Cache files while connected<br />to browse them offline
				</p>
			</div>
		{:else if !isGuest}
			<div class="flex flex-col items-center gap-3 text-center">
				<svg
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1"
					class="text-text-muted h-8 w-8 opacity-40"
				>
					<path d="M2 4h12v8H2z" />
					<path d="M6 8h4M8 6v4" stroke-width="1.2" />
				</svg>
				<p class="text-text-muted font-mono text-xs tracking-wider uppercase">No content</p>
				<a
					href="/drive/{driveId}/settings"
					class="border-border text-text-secondary hover:border-accent-dim hover:text-accent rounded border px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase transition"
				>
					Add a Drive in Settings
				</a>
			</div>
		{:else}
			<p class="text-text-muted font-mono text-xs tracking-wider uppercase">Empty</p>
		{/if}
	</div>
{:else}
	<div class="grid gap-3 p-4" style="grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));">
		{#each entries as e (e.name)}
			<FileItem
				name={e.name}
				isFolder={e.isFolder}
				cached={e.cached}
				{peers}
				{isGuest}
				href={e.isFolder
					? `/drive/${driveId}?path=${encodeURIComponent(joinPath(e.name))}`
					: `/drive/${driveId}/preview?file=${encodeURIComponent(joinPath(e.name))}`}
			/>
		{/each}
	</div>
{/if}
