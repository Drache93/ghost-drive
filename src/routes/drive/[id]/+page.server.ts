import type { PageServerLoad } from './$types';
import { loadDrive, loadEntries } from '$lib/server/loaders';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const dirPath = url.searchParams.get('path') || '/';
	return {
		path: dirPath,
		drive: loadDrive(locals.app, params.id),
		entries: loadEntries(locals.app, params.id, dirPath)
	};
};
