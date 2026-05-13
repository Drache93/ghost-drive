import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import GhostDriveApp from '$lib/server/app.js';
// @ts-expect-error bare-storage
import storage from 'bare-storage';
import path from 'path';
import process from 'process';

let app: any = null;

if (!building && !app) {
	const dir = path.join(storage.persistent(), 'ghost-drive');
	app = new GhostDriveApp({ dir });
	app
		.ready()
		.then(() => console.log('ghost-drive ready, key:', app.key.toString('hex')))
		.catch((err: Error) => console.error('ghost-drive boot failed:', err));

	process.on('sveltekit:close', async () => {
		try {
			await app?.close();
		} catch {}
	});
}

export const handle: Handle = ({ event, resolve }) => {
	event.locals.app = app;
	return resolve(event);
};
