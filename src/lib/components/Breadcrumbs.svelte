<script lang="ts">
	let {
		driveId,
		driveName,
		path: dirPath
	}: { driveId: string; driveName: string; path: string } = $props();

	const parts = $derived(dirPath === '/' ? [] : dirPath.split('/').filter(Boolean));

	function pathTo(i: number) {
		return '/' + parts.slice(0, i + 1).join('/');
	}
</script>

<div class="text-text-secondary flex items-center gap-0.5 font-mono text-[11px]">
	<a href={`/drive/${driveId}`} class="hover:text-accent rounded px-1.5 py-0.5 transition">
		{driveName}
	</a>
	{#each parts as part, i}
		<span class="text-text-muted select-none px-0.5">›</span>
		{#if i === parts.length - 1}
			<span class="text-text-primary px-1.5 py-0.5">{part}</span>
		{:else}
			<a
				href={`/drive/${driveId}?path=${encodeURIComponent(pathTo(i))}`}
				class="hover:text-accent rounded px-1.5 py-0.5 transition"
			>
				{part}
			</a>
		{/if}
	{/each}
</div>
