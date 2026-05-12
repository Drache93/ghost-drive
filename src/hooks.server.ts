import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
// @ts-expect-error untyped JS module
import GhostDriveApp from '$lib/server/app.js';
// @ts-expect-error bare-storage
import storage from 'bare-storage';
import path from 'path';
import process from 'process';

let app: any = null;

if (!building && !app) {
	const dir = path.join(storage.persistent(), 'ghost-drive');
	app = new GhostDriveApp({ dir });
	// Expose for build/index.js so it can await readiness before loadURL.
	(globalThis as any).__ghostDriveApp = app;
	app
		.ready()
		.then(() => console.log('ghost-drive ready, key:', app.key.toString('hex')))
		.catch((err: Error) => console.error('ghost-drive boot failed:', err));

	const teardown = async () => {
		try {
			await app?.close();
		} catch {}
	};
	process.on('SIGINT', teardown);
	process.on('SIGTERM', teardown);
}

export const handle: Handle = ({ event, resolve }) => {
	event.locals.app = app;
	return resolve(event);
};
