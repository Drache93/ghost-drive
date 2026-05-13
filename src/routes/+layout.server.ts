import type { LayoutServerLoad } from './$types';
import { loadSessions } from '$lib/server/loaders';

export const load: LayoutServerLoad = ({ locals, depends }) => {
	depends('app:layout');
	return { sessions: loadSessions(locals.app) };
};
