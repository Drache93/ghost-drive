import Protomux from 'protomux';
import c from 'compact-encoding';
import HyperswarmCapability from 'hyperswarm-capability';

const cap = new HyperswarmCapability();
const PROTOCOL = 'ghost-drive/cap';
const TIMEOUT_MS = 8000;

// Both sides call this with the same capKey.
// Initiator sends first, responder verifies and replies, initiator verifies reply.
export function exchange(conn, capKey) {
	return new Promise((resolve) => {
		const mux = Protomux.from(conn);
		let done = false;
		let timer = null;

		function finish(ok) {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resolve(ok);
		}

		timer = setTimeout(() => {
			ch.close();
			finish(false);
		}, TIMEOUT_MS);

		const ch = mux.createChannel({
			protocol: PROTOCOL,
			onopen() {
				if (conn.isInitiator) msg.send(cap.generate(conn, capKey));
			},
			onclose() {
				finish(false);
			}
		});

		const msg = ch.addMessage({
			encoding: c.fixed32,
			onmessage(received) {
				if (conn.isInitiator) {
					finish(cap.verify(conn, capKey, received));
					ch.close();
				} else {
					if (cap.verify(conn, capKey, received)) {
						msg.send(cap.generate(conn, capKey));
						finish(true);
					} else {
						finish(false);
					}
					ch.close();
				}
			}
		});

		ch.open();
	});
}

// Server side — try each candidate capKey against what the client sends.
// Strict: if no message received within timeout, or wrong cap sent → false.
// Returns the matched capKey buffer on success, false otherwise.
export function exchangeAny(conn, capKeys) {
	if (!capKeys || capKeys.length === 0) return Promise.resolve(false);

	return new Promise((resolve) => {
		const mux = Protomux.from(conn);
		let done = false;
		let received = false;
		let timer = null;

		function finish(result) {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resolve(result);
		}

		timer = setTimeout(() => {
			ch.close();
			finish(false);
		}, TIMEOUT_MS);

		const ch = mux.createChannel({
			protocol: PROTOCOL,
			onopen() {},
			onclose() {
				if (!received) finish(false);
			}
		});

		const msg = ch.addMessage({
			encoding: c.fixed32,
			onmessage(buf) {
				received = true;
				let matched = null;
				for (const key of capKeys) {
					if (cap.verify(conn, key, buf)) {
						matched = key;
						break;
					}
				}

				if (matched) {
					msg.send(cap.generate(conn, matched));
					finish(matched);
				} else {
					finish(false);
				}

				ch.close();
			}
		});

		ch.open();
	});
}

// Multi-session routing: try capKeys from all sessions.
// Returns { sessionId, capKey } on match, or false.
// capEntries: Array of { sessionId: string, capKey: Buffer }
export async function exchangeForSession(conn, capEntries) {
	if (!capEntries || capEntries.length === 0) return false;

	const keys = capEntries.map((e) => e.capKey);
	const matched = await exchangeAny(conn, keys);
	if (!matched) return false;

	const entry = capEntries.find((e) => e.capKey.equals(matched));
	return entry ? { sessionId: entry.sessionId, capKey: matched } : false;
}

export default { exchange, exchangeAny, exchangeForSession };
