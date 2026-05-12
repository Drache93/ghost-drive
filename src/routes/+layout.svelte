<script lang="ts">
	import './layout.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import logo from '$lib/assets/images/ghost.png';

	let { data, children }: { data: LayoutData; children: any } = $props();

	let sidebarOpen = $state(false);

	// Auto-close the sidebar whenever the route changes (mobile UX).
	$effect(() => {
		page.url.pathname;
		sidebarOpen = false;
	});

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}
</script>

<svelte:head>
	<title>Ghost Drive</title>
	<link rel="icon" href={logo} />
</svelte:head>

<div class="bg-bg-primary text-text-primary relative flex h-screen w-screen overflow-hidden">
	<!-- Sidebar: full width on desktop, slide-over on mobile -->
	<div
		class="absolute inset-y-0 left-0 z-40 transition-transform md:relative md:translate-x-0"
		class:-translate-x-full={!sidebarOpen}
		class:translate-x-0={sidebarOpen}
	>
		<Sidebar sessions={data.sessions} onClose={() => (sidebarOpen = false)} />
	</div>

	<!-- Backdrop on mobile -->
	{#if sidebarOpen}
		<button
			type="button"
			aria-label="Close sidebar"
			onclick={() => (sidebarOpen = false)}
			class="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
		></button>
	{/if}

	<main class="flex flex-1 flex-col overflow-hidden">
		<!-- Mobile-only top bar with hamburger -->
		<div
			class="border-border bg-bg-secondary flex items-center gap-3 border-b px-3 pt-6 pb-2 md:hidden"
		>
			<button
				type="button"
				aria-label="Open menu"
				onclick={toggleSidebar}
				class="text-text-secondary hover:text-accent rounded p-1.5 transition"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					class="h-5 w-5"
				>
					<path d="M3 6h18M3 12h18M3 18h18" />
				</svg>
			</button>
			<h1 class="text-accent font-mono text-[10px] tracking-[4px] uppercase">Ghost Drive</h1>
		</div>

		{@render children()}
	</main>
</div>
