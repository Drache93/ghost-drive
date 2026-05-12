import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.app?.opened) await locals.app?.ready?.();

	const session = locals.app.getSession(params.id);
	if (!session) {
		console.warn(`[file-browser] 404: session ${params.id} not found. Available: [${[...locals.app.sessions.keys()].join(', ')}]`);
		throw error(404, 'Drive not found');
	}

	const dirPath = url.searchParams.get('path') || '/';
	const drive = session.drive;

	console.log(`[file-browser] readdir '${dirPath}' — session=${params.id}, drives=${drive.drives.length}, drive-types=[${drive.drives.map((d: any) => d.constructor?.name || 'unknown').join(', ')}]`);

	const entries: Array<{ name: string; isFolder: boolean; cached: boolean }> = [];
	try {
		// distributed-drive's readdir yields entry objects with `key` (full path).
		const seen = new Set<string>();
		for await (const item of drive.readdir(dirPath)) {
			const name = typeof item === 'string' ? item : item.key || item.name;
			if (!name || name.startsWith('.')) continue;
			if (seen.has(name)) continue;
			seen.add(name);

			// Detect folder vs file: look up an entry; if missing → folder (subdir).
			const fullPath = dirPath === '/' ? '/' + name : `${dirPath}/${name}`;
			let isFolder = false;
			try {
				const entry = await drive.entry(fullPath);
				isFolder = !entry || !entry.value;
			} catch {
				isFolder = true;
			}

			let cached = false;
			try {
				const cacheEntry = await session.cache.entry(fullPath);
				cached = !!cacheEntry;
			} catch {}

			entries.push({ name, isFolder, cached });
		}
	} catch (err) {
		console.warn('readdir failed:', err);
	}

	entries.sort((a, b) => {
		if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	return {
		drive: { id: session.id, name: session.name, peerCount: session.peerCount },
		path: dirPath,
		entries
	};
};
