<script lang="ts">
	import FileItem from './FileItem.svelte';

	type Entry = { name: string; isFolder: boolean; cached?: boolean };

	let {
		driveId,
		path: dirPath,
		entries
	}: { driveId: string; path: string; entries: Entry[] } = $props();

	function joinPath(name: string) {
		return dirPath === '/' ? '/' + name : `${dirPath}/${name}`;
	}
</script>

{#if entries.length === 0}
	<div class="flex h-full items-center justify-center">
		<p class="font-mono text-xs uppercase tracking-wider text-text-muted">Empty</p>
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
				href={e.isFolder
					? `/drive/${driveId}?path=${encodeURIComponent(joinPath(e.name))}`
					: `/drive/${driveId}/preview?file=${encodeURIComponent(joinPath(e.name))}`}
			/>
		{/each}
	</div>
{/if}
