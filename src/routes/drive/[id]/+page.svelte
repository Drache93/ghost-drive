<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import FileGrid from '$lib/components/FileGrid.svelte';
	import LivePeerCount from '$lib/components/LivePeerCount.svelte';

	let { data }: { data: PageData } = $props();
</script>

<header class="flex items-center gap-3 border-b border-border bg-bg-secondary px-4 py-3">
	<Breadcrumbs driveId={data.drive.id} driveName={data.drive.name} path={data.path} />
	<div class="flex-1"></div>
	<LivePeerCount driveId={data.drive.id} initial={data.drive.peerCount} />
	<a
		href={`/drive/${data.drive.id}/settings`}
		class="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition hover:text-accent"
		title="Drive settings"
	>
		⚙ Settings
	</a>
</header>

<section class="flex-1 overflow-auto">
	<FileGrid driveId={data.drive.id} path={data.path} entries={data.entries} />
</section>
