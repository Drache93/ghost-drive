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

<div class="flex items-center gap-1 font-mono text-[11px] text-text-secondary">
	<a
		href={`/drive/${driveId}`}
		class="rounded px-1.5 py-0.5 transition hover:text-accent"
	>
		{driveName}
	</a>
	{#each parts as part, i}
		<span class="text-text-muted">/</span>
		{#if i === parts.length - 1}
			<span class="text-text-primary">{part}</span>
		{:else}
			<a
				href={`/drive/${driveId}?path=${encodeURIComponent(pathTo(i))}`}
				class="rounded px-1.5 py-0.5 transition hover:text-accent"
			>
				{part}
			</a>
		{/if}
	{/each}
</div>
