declare global {
	namespace App {
		interface Locals {
			app: any; // GhostDriveApp from $lib/server/app.cjs (CJS, untyped)
		}
	}
}

export {};
