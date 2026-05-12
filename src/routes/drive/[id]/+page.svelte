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

<header class="border-border bg-bg-secondary flex items-center gap-3 border-b px-4 py-3">
	<Breadcrumbs driveId={data.drive.id} driveName={data.drive.name} path={data.path} />
	<div class="flex-1"></div>
	<LivePeerCount
		driveId={data.drive.id}
		initial={data.drive.peerCount}
		{reconnectSignal}
		onchange={handlePeersChange}
	/>
	<a
		href={`/drive/${data.drive.id}/settings`}
		class="text-text-secondary hover:text-accent rounded px-2 py-1 font-mono text-[10px] tracking-wider uppercase transition"
		title="Drive settings"
	>
		⚙ Settings
	</a>
</header>

{#if data.drive.isGuest && peers === 0}
	<div
		class="border-border flex items-center gap-3 border-b px-4 py-2 {connectionLost
			? 'bg-danger/10'
			: 'bg-bg-secondary'}"
	>
		<span
			class="block h-1.5 w-1.5 rounded-full"
			class:bg-danger={connectionLost}
			class:bg-text-muted={!connectionLost}
			class:animate-pulse={!connectionLost}
		></span>
		<span class="text-text-secondary flex-1 font-mono text-[10px] tracking-wider">
			{#if connectionLost}
				Connection lost · showing cached files only
			{:else}
				Waiting for host · files will appear when connected
			{/if}
		</span>
		<button
			type="button"
			onclick={retry}
			class="text-accent hover:brightness-110 font-mono text-[10px] tracking-wider uppercase"
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
