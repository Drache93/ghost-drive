import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.app?.opened) await locals.app?.ready?.();

	const session = locals.app.getSession(params.id);
	if (!session) throw error(404, 'Drive not found');

	const filePath = url.searchParams.get('file');
	if (!filePath) throw error(400, 'Missing file');

	const entry = await session.drive.entry(filePath);
	if (!entry) throw error(404, 'File not found');

	const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
	const kind = detectKind(ext);

	let textPreview: string | null = null;
	let isBinary = false;
	let isEmpty = false;

	if (kind === 'text') {
		const size = entry.value?.blob?.byteLength ?? 0;
		if (size === 0) {
			isEmpty = true;
		} else {
			const head = await session.drive.read(filePath, { start: 0, end: Math.min(size - 1, 8191) });
			if (head && head.length > 0) {
				if (containsNullByte(head)) {
					isBinary = true;
				} else {
					try {
						const fullSize = Math.min(size, 256 * 1024); // cap text preview at 256KB
						const all =
							fullSize <= head.length
								? head
								: await session.drive.read(filePath, { start: 0, end: fullSize - 1 });
						textPreview = all.toString('utf-8');
						if (textPreview.includes('�')) {
							isBinary = true;
							textPreview = null;
						}
					} catch {
						isBinary = true;
					}
				}
			} else {
				isEmpty = true;
			}
		}
	}

	let cached = false;
	try {
		const c = await session.cache.entry(filePath);
		cached = !!c;
	} catch {}

	return {
		drive: { id: session.id, name: session.name },
		path: filePath,
		kind,
		textPreview,
		isBinary,
		isEmpty,
		cached
	};
};

export const actions: Actions = {
	cache: async ({ locals, params, request }) => {
		const session = locals.app.getSession(params.id);
		if (!session) throw error(404, 'Drive not found');

		const form = await request.formData();
		const filePath = (form.get('file') ?? '').toString();
		if (!filePath) return fail(400, { error: 'Missing file' });

		try {
			await session.cacheFile(filePath);
		} catch (err: any) {
			return fail(500, { error: err.message });
		}
		throw redirect(303, `/drive/${params.id}/preview?file=${encodeURIComponent(filePath)}`);
	}
};

function detectKind(ext: string): 'video' | 'audio' | 'image' | 'text' | 'binary' {
	if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
	if (['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) return 'audio';
	if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
	if (
		['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'sh', 'py', 'go', 'rs', 'yml', 'yaml', 'log'].includes(
			ext
		)
	)
		return 'text';
	return 'binary';
}

function containsNullByte(buf: Buffer) {
	for (let i = 0; i < buf.length && i < 8192; i++) {
		if (buf[i] === 0) return true;
	}
	return false;
}
