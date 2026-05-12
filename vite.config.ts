import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		external: [
			'distributed-drive',
			'hyperbee2',
			'protomux',
			'localdrive',
			'hyperdrive',
			'corestore',
			'hyperswarm',
			'hyperdb',
			'sodium-native',
			'ready-resource',
			'b4a',
			'mirror-drive',
			'compact-encoding',
			'protomux-rpc',
			'safety-catch',
			'record-cache',
			'streamx',
			'bare-storage',
			'bare-fs',
			'bare-path',
			'bare-os',
			'bare-crypto',
			'bare-encoding'
		]
	}
});
