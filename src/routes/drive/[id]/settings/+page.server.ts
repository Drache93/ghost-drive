import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.app?.opened) await locals.app?.ready?.();

	const session = locals.app.getSession(params.id);
	if (!session) throw error(404, 'Drive not found');

	const drives = session.listDrives();

	const invites = await session.unusedInvites();
	const latestInvite = invites.length ? invites[invites.length - 1] : null;
	let inviteUrl: string | null = null;
	if (latestInvite) {
		try {
			inviteUrl = locals.app.encodeInvite(session, latestInvite.capKey);
		} catch {}
	}

	const joins = await session.listJoins();
	const peers = joins.map((j: any) => ({
		key: j.peerKey,
		short: `${j.peerKey.slice(0, 6)}…${j.peerKey.slice(-4)}`,
		online: session.isPeerOnline(j.peerKey)
	}));

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

	createInvite: async ({ locals, params }) => {
		const session = locals.app.getSession(params.id);
		if (!session) throw error(404, 'Drive not found');

		await session.createInvite();
		throw redirect(303, `/drive/${params.id}/settings`);
	},

	removePeer: async ({ locals, params, request }) => {
		const session = locals.app.getSession(params.id);
		if (!session) throw error(404, 'Drive not found');

		const form = await request.formData();
		const peerKey = (form.get('peerKey') ?? '').toString();
		if (!peerKey) return fail(400, { error: 'Missing peer' });

		await session.removeJoin(peerKey);
		throw redirect(303, `/drive/${params.id}/settings`);
	},

	deleteSession: async ({ locals, params }) => {
		await locals.app.removeSession(params.id);
		throw redirect(303, '/');
	}
};
