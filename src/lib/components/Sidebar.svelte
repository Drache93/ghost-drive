<script lang="ts">
	import { page } from '$app/state';

	type SessionInfo = {
		id: string;
		name: string;
		icon: string | null;
		peerCount: number;
	};

	let { sessions, onClose = () => {} }: { sessions: SessionInfo[]; onClose?: () => void } =
		$props();

	const activeId = $derived(page.params?.id ?? null);
</script>

<aside class="border-border bg-bg-secondary flex h-full w-72 flex-col border-r py-4 sm:py-0">
	<header class="border-border flex items-center justify-between border-b p-4">
		<a href="/" class="block">
			<h1 class="text-accent font-mono text-[10px] tracking-[4px] uppercase">Ghost Drive</h1>
		</a>
		<button
			type="button"
			aria-label="Close sidebar"
			onclick={onClose}
			class="text-text-muted hover:text-accent text-lg leading-none transition md:hidden"
		>
			×
		</button>
	</header>

	<nav class="flex-1 overflow-y-auto p-2">
		{#if sessions.length === 0}
			<p class="text-text-muted px-2 py-3 font-mono text-[10px] tracking-wider uppercase">
				No drives yet
			</p>
		{:else}
			<ul class="space-y-1">
				{#each sessions as s (s.id)}
					{@const active = s.id === activeId}
					<li>
						<a
							href={`/drive/${s.id}`}
							class="hover:bg-bg-hover flex items-center gap-3 rounded-md border-r-2 border-l-2 border-transparent px-3 py-2 transition {active
								? 'bg-bg-hover border-l-accent border-r-accent'
								: ''}"
						>
							<span
								class="bg-bg-tertiary text-accent-dim flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded"
							>
								{#if s.icon}
									<img src={s.icon} alt="" class="h-full w-full object-cover" />
								{:else}
									<svg
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										stroke-width="1.2"
										class="h-4 w-4"
									>
										<path d="M2 4h12v8H2z" />
										<circle cx="12" cy="8" r="1" />
									</svg>
								{/if}
							</span>
							<span class="flex-1 truncate text-sm">{s.name}</span>
							{#if s.peerCount > 0}
								<span class="text-success font-mono text-[9px] tracking-wider">
									{s.peerCount}
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</nav>

	<footer class="border-border space-y-1 border-t p-2">
		<a
			href="/?action=new"
			class="text-text-secondary hover:bg-bg-hover hover:text-accent block rounded-md px-3 py-2 font-mono text-[10px] tracking-wider uppercase transition"
		>
			+ New Drive
		</a>
		<a
			href="/?action=join"
			class="text-text-secondary hover:bg-bg-hover hover:text-accent block rounded-md px-3 py-2 font-mono text-[10px] tracking-wider uppercase transition"
		>
			⇲ Accept Invite
		</a>
	</footer>
</aside>
