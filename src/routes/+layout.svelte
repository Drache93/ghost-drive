<script lang="ts">
	import './layout.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<svelte:head><title>Ghost Drive</title></svelte:head>

<div class="flex h-screen w-screen bg-bg-primary text-text-primary">
	<Sidebar sessions={data.sessions} />
	<main class="flex flex-1 flex-col overflow-hidden">
		{@render children()}
	</main>
</div>
