const process = require('bare-process');
const storage = require('bare-storage');
const PearRuntime = require('pear-runtime');

const pkg = require('./package.json');
const { isLinux, isMac, isWindows } = require('which-runtime');
const path = require('bare-path');
const { name, productName, version, upgrade } = pkg;
const appName = productName ?? name;

let pear = null;

function getAppPath() {
	if (isLinux && process.env.APPIMAGE) return process.env.APPIMAGE;
	if (isWindows) return process.execPath;
	return process.execPath;
}

function getPear(pearStore, updates) {
	if (pear) return pear;
	const appPath = getAppPath();
	console.log(appPath);
	let dir = null;
	if (pearStore) {
		console.log('pear store: ' + pearStore);
		dir = pearStore;
	} else if (appPath === null) {
		dir = path.join(storage.ephemeral(), 'pear', appName);
	} else {
		dir = path.join(storage.persistent(), appName);
	}

	const extension = isLinux ? '.AppImage' : isMac ? '.app' : '.msix';
	pear = new PearRuntime({
		dir,
		app: appPath,
		updates,
		version,
		upgrade,
		name: productName + extension
	});
	pear.on('error', console.error); // print network errors, etc.
	return pear;
}

module.exports = { getPear };
