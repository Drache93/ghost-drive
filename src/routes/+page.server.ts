import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import type GhostDriveApp from '$lib/server/app.js';

export const load: PageServerLoad = ({ locals, url }) => {
	if (url.searchParams.get('action')) return {};
	return { autoOpen: findLastSession(locals.app) };
};

async function findLastSession(app: GhostDriveApp | null): Promise<string | null> {
	if (!app) return null;
	await app.ready();
	const all = (await app.db!.find('@ghostdrive/sessions', { gte: {}, lte: {} }).toArray()) as any[];
	const last = all.sort(
		(a: any, b: any) => (b.lastOpened ?? b.createdAt ?? 0) - (a.lastOpened ?? a.createdAt ?? 0)
	)[0];
	if (last && app.sessions.has(last.id)) return last.id;
	return null;
}

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
		return { redirect: `/drive/${session.id}` };
	},

	accept: async ({ locals, request }) => {
		const form = await request.formData();
		const url = (form.get('url') ?? '').toString().trim();
		if (!url) return fail(400, { url, missing: true });

		try {
			const session = await locals.app.acceptInvite(url);
			return { redirect: `/drive/${session.id}` };
		} catch (err: any) {
			return fail(400, { url, error: err.message });
		}
	}
};
