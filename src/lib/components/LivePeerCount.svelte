<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	let { driveId, initial }: { driveId: string; initial: number } = $props();

	let peers = $state(initial);
	let es: EventSource | null = null;

	onMount(() => {
		es = new EventSource(`/drive/${driveId}/stream`);
		es.addEventListener('peers', (e) => {
			try {
				const { count } = JSON.parse((e as MessageEvent).data);
				peers = count;
				// Re-run all loads so sidebar peer count + page readdir refresh.
				invalidateAll();
			} catch {}
		});
		// Peer's drives just became queryable (RPC opened) — re-run readdir.
		es.addEventListener('drives-changed', () => invalidateAll());
	});

	onDestroy(() => {
		es?.close();
	});
</script>

<span
	class="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider"
	class:text-success={peers > 0}
	class:text-text-muted={peers === 0}
>
	<span
		class="block h-1.5 w-1.5 rounded-full"
		class:bg-success={peers > 0}
		class:bg-text-muted={peers === 0}
		style:box-shadow={peers > 0 ? '0 0 6px rgba(34,197,94,.6)' : 'none'}
	></span>
	{peers}
	{peers === 1 ? 'peer' : 'peers'}
</span>
