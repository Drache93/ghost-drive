import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (url.searchParams.get('action')) return {};
	if (!locals.app?.opened) await locals.app?.ready?.();

	const all = await locals.app.db.find('@ghostdrive/sessions', { gte: {}, lte: {} }).toArray();
	const last = all
		.filter((s: any) => s.lastOpened)
		.sort((a: any, b: any) => b.lastOpened - a.lastOpened)[0];

	if (last && locals.app.sessions.has(last.id)) {
		throw redirect(303, `/drive/${last.id}`);
	}

	return {};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const form = await request.formData();
		const name = (form.get('name') ?? '').toString().trim();
		if (!name) return fail(400, { name, missing: true });

		const iconFile = form.get('icon') as File | null;
		let icon: Buffer = Buffer.alloc(0);
		if (iconFile && iconFile.size > 0) {
			const arr = new Uint8Array(await iconFile.arrayBuffer());
			icon = Buffer.from(arr);
		}

		const session = await locals.app.createSession({ name, icon });
		throw redirect(303, `/drive/${session.id}`);
	},

	accept: async ({ locals, request }) => {
		const form = await request.formData();
		const url = (form.get('url') ?? '').toString().trim();
		if (!url) return fail(400, { url, missing: true });

		try {
			const session = await locals.app.acceptInvite(url);
			throw redirect(303, `/drive/${session.id}`);
		} catch (err: any) {
			if (err?.status === 303) throw err;
			return fail(400, { url, error: err.message });
		}
	}
};
