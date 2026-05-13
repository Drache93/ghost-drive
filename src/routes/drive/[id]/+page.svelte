<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import FileGrid from '$lib/components/FileGrid.svelte';
	import LivePeerCount from '$lib/components/LivePeerCount.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let peers = $state(data.drive.peerCount);
	let connectionLost = $state(false);
	let reconnectSignal = $state(0);

	function handlePeersChange(n: number) {
		if (n === 0 && peers > 0) connectionLost = true;
		else if (n > 0) connectionLost = false;
		peers = n;
	}

	function retry() {
		reconnectSignal++;
		invalidateAll();
	}
</script>

<header
	class="border-border bg-bg-secondary flex h-11 items-center gap-2 border-b px-3 md:gap-3 md:px-4"
>
	<div class="min-w-0 flex-1">
		<Breadcrumbs driveId={data.drive.id} driveName={data.drive.name} path={data.path} />
	</div>
	<LivePeerCount
		driveId={data.drive.id}
		initial={data.drive.peerCount}
		{reconnectSignal}
		onchange={handlePeersChange}
	/>
	<a
		href={`/drive/${data.drive.id}/settings`}
		class="text-text-muted hover:text-accent rounded p-1.5 transition"
		title="Drive settings"
	>
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" class="h-4 w-4">
			<circle cx="8" cy="8" r="2" />
			<path
				d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"
			/>
		</svg>
	</a>
</header>

{#if data.drive.isGuest && peers === 0}
	<div
		class="flex items-center gap-3 border-b px-4 py-2 {connectionLost
			? 'border-danger/40 bg-danger/5 border-l-danger border-l-2'
			: 'border-border border-l-text-muted bg-bg-secondary border-l-2'}"
	>
		<span
			class="block h-1.5 w-1.5 shrink-0 rounded-full"
			class:bg-danger={connectionLost}
			class:bg-text-muted={!connectionLost}
			class:animate-pulse={!connectionLost}
		></span>
		<span
			class="flex-1 font-mono text-[10px] tracking-wider"
			class:text-danger={connectionLost}
			class:text-text-secondary={!connectionLost}
		>
			{#if connectionLost}
				Connection lost · showing cached files only
			{:else}
				Waiting for host · files will appear when connected
			{/if}
		</span>
		<button
			type="button"
			onclick={retry}
			class="font-mono text-[10px] tracking-wider uppercase transition"
			class:text-danger={connectionLost}
			class:text-accent={!connectionLost}
		>
			Retry
		</button>
	</div>
{/if}

<section class="flex-1 overflow-auto">
	<FileGrid
		driveId={data.drive.id}
		path={data.path}
		entries={data.entries}
		{peers}
		isGuest={data.drive.isGuest}
	/>
</section>
