import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends('app:layout');
	if (!locals.app?.opened) await locals.app?.ready?.();

	const sessions = locals.app.listSessions().map((s: any) => ({
		id: s.id,
		name: s.name,
		icon: s.icon && s.icon.length > 0 ? bufferToDataUri(s.icon) : null,
		peerCount: s.peerCount
	}));

	return { sessions };
};

function bufferToDataUri(buf: Buffer): string {
	const b0 = buf[0];
	const b1 = buf[1];
	let mime = 'image/png';
	if (b0 === 0xff && b1 === 0xd8) mime = 'image/jpeg';
	else if (b0 === 0x47 && b1 === 0x49) mime = 'image/gif';
	else if (b0 === 0x3c) mime = 'image/svg+xml';
	return `data:${mime};base64,${buf.toString('base64')}`;
}
