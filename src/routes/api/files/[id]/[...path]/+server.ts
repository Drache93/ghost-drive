import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

const CHUNK_SIZE = 1024 * 1024; // 1MB

const MIME: Record<string, string> = {
	mp4: 'video/mp4',
	mkv: 'video/x-matroska',
	avi: 'video/x-msvideo',
	webm: 'video/webm',
	mov: 'video/quicktime',
	mp3: 'audio/mpeg',
	flac: 'audio/flac',
	ogg: 'audio/ogg',
	wav: 'audio/wav',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	pdf: 'application/pdf',
	txt: 'text/plain; charset=utf-8',
	md: 'text/plain; charset=utf-8',
	html: 'text/html; charset=utf-8',
	json: 'application/json; charset=utf-8'
};

function mimeFor(filePath: string) {
	const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
	return MIME[ext] || 'application/octet-stream';
}

export const GET: RequestHandler = async ({ locals, params, request, url }) => {
	if (!locals.app?.opened) await locals.app?.ready?.();

	const session = locals.app.getSession(params.id);
	if (!session) throw error(404, 'Drive not found');

	const filePath = '/' + (params.path ?? '');
	const entry = await session.drive.entry(filePath);
	if (!entry) throw error(404, 'File not found');

	const size: number | null = entry.value?.blob?.byteLength ?? null;
	const mime = mimeFor(filePath);
	const filename = filePath.split('/').pop() || 'file';
	const isDownload = url.searchParams.get('dl') === '1';

	let start = 0;
	let end = size ? size - 1 : 0;
	let partial = false;

	const range = request.headers.get('range');
	if (range && size) {
		const m = /bytes=(\d+)-(\d*)/.exec(range);
		if (m) {
			start = parseInt(m[1], 10);
			end = m[2] ? parseInt(m[2], 10) : size - 1;
			partial = true;
		}
	}

	const length = end - start + 1;

	const headers: Record<string, string> = { 'Content-Type': mime };
	if (size) {
		headers['Content-Length'] = String(length);
		headers['Accept-Ranges'] = 'bytes';
	}
	if (partial) {
		headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
	}
	if (isDownload) {
		headers['Content-Disposition'] = `attachment; filename="${filename}"`;
	}

	const drive = session.drive;
	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			let offset = start;
			try {
				while (offset <= end) {
					const chunkEnd = Math.min(offset + CHUNK_SIZE - 1, end);
					const buf = await drive.read(filePath, { start: offset, end: chunkEnd });
					if (!buf || buf.length === 0) break;
					controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
					offset += buf.length;
				}
				controller.close();
			} catch (err) {
				controller.error(err);
			}
		}
	});

	return new Response(stream, { status: partial ? 206 : 200, headers });
};
