import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Server-Sent Events for live drive state. Client opens with `new EventSource`.
// Events:
//   - peers: { count: number }
//   - drives-changed: { /* trigger reload */ }
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.app?.opened) await locals.app?.ready?.();
	const session = locals.app.getSession(params.id);
	if (!session) throw error(404, 'Drive not found');

	const enc = new TextEncoder();
	const frame = (event: string, data: unknown) =>
		enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

	let onConnected: ((hex: string) => void) | null = null;
	let onDisconnected: ((hex: string) => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			// Initial state
			controller.enqueue(frame('peers', { count: session.peerCount }));
			controller.enqueue(enc.encode(': connected\n\n'));

			onConnected = () => controller.enqueue(frame('peers', { count: session.peerCount }));
			onDisconnected = () => controller.enqueue(frame('peers', { count: session.peerCount }));

			session.on('peer-connected', onConnected);
			session.on('peer-disconnected', onDisconnected);
		},
		cancel() {
			if (onConnected) session.off('peer-connected', onConnected);
			if (onDisconnected) session.off('peer-disconnected', onDisconnected);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
