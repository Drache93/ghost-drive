import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePlugin as bareExternals } from 'sveltekit-adapter-bare';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), bareExternals()],
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
			'streamx'
		]
	}
});
