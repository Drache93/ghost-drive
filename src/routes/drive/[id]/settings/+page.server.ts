import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import b4a from 'b4a';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.app?.opened) await locals.app?.ready?.();

	const session = locals.app.getSession(params.id);
	if (!session) throw error(404, 'Drive not found');

	const drives = session.listDrives();

	// Invite is always the drive's key — no need to "create" one.
	const inviteUrl = locals.app.encodeInvite(session);

	// Live peers from distributed-drive's peer set.
	const peers: Array<{ key: string; short: string; online: boolean }> = [];

	for await (const peer of session.drive.getPeerKeys()) {
		const hex = b4a.toString(peer, 'hex');
		peers.push({
			key: hex,
			short: `${hex.slice(0, 6)}…${hex.slice(-4)}`,
			online: true
		});
	}

	return {
		drive: { id: session.id, name: session.name },
		drives,
		inviteUrl,
		peers
	};
};

export const actions: Actions = {
	addDrive: async ({ locals, params, request }) => {
		const session = locals.app.getSession(params.id);
		if (!session) throw error(404, 'Drive not found');

		const form = await request.formData();
		const target = (form.get('target') ?? '').toString().trim();
		if (!target) return fail(400, { error: 'Target required' });

		try {
			if (/^[0-9a-f]{64}$/i.test(target)) {
				await session.addHyperdrive(target);
			} else {
				await session.addLocalDrive(target);
			}
		} catch (err: any) {
			return fail(400, { error: err.message });
		}

		throw redirect(303, `/drive/${params.id}/settings`);
	},

	removeDrive: async ({ locals, params, request }) => {
		const session = locals.app.getSession(params.id);
		if (!session) throw error(404, 'Drive not found');

		const form = await request.formData();
		const target = (form.get('target') ?? '').toString();
		if (!target || target === 'cache') return fail(400, { error: 'Cannot remove cache' });

		await session.removeDrive(target);
		throw redirect(303, `/drive/${params.id}/settings`);
	},

	deleteSession: async ({ locals, params }) => {
		await locals.app.removeSession(params.id);
		throw redirect(303, '/');
	}
};
