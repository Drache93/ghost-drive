<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	let {
		open = $bindable(false),
		title = '',
		message = '',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		onConfirm = () => {},
		onCancel = () => {}
	}: {
		open?: boolean;
		title?: string;
		message?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onConfirm?: () => void;
		onCancel?: () => void;
	} = $props();

	function handleConfirm() {
		open = false;
		onConfirm();
	}

	function handleCancel() {
		open = false;
		onCancel();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') handleCancel();
		if (e.key === 'Enter') handleConfirm();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		transition:fade={{ duration: 120 }}
	>
		<div
			class="border-border bg-bg-secondary mx-4 w-full max-w-md rounded-lg border p-6 shadow-2xl"
			transition:scale={{ duration: 150, start: 0.96 }}
		>
			{#if title}
				<h3 class="text-accent mb-2 font-mono text-xs tracking-[3px] uppercase">{title}</h3>
			{/if}
			<p class="text-text-secondary mb-6 font-mono text-[11px] leading-relaxed">{message}</p>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={handleCancel}
					class="text-text-secondary hover:text-text-primary rounded px-4 py-2 font-mono text-[10px] tracking-wider uppercase transition"
				>
					{cancelLabel}
				</button>
				<button
					type="button"
					onclick={handleConfirm}
					class="rounded px-4 py-2 font-mono text-[10px] tracking-wider uppercase transition {danger
						? 'border-danger text-danger hover:bg-danger hover:text-bg-primary border'
						: 'bg-accent text-bg-primary hover:brightness-110'}"
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
