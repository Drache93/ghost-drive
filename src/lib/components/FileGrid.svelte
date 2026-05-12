<script lang="ts">
	import FileItem from './FileItem.svelte';

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
				<p class="text-text-muted font-mono text-xs tracking-wider uppercase">No cached files</p>
				<p class="text-text-muted font-mono text-[10px]">
					Cache files while connected to browse them offline
				</p>
			</div>
		{:else if peers === 0 && !isGuest}
			<div class="flex flex-col items-center gap-2 text-center">
				<p class="text-text-muted font-mono text-xs tracking-wider uppercase">No content</p>
				<p class="text-text-muted font-mono text-[10px]">
					Add a local or Hyperdrive in <a
						href="settings"
						class="text-accent underline underline-offset-2">Settings</a
					>
				</p>
			</div>
		{:else}
			<p class="text-text-muted font-mono text-xs tracking-wider uppercase">Empty</p>
		{/if}
	</div>
{:else}
	<div
		class="grid gap-3 p-4"
		style="grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));"
	>
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
