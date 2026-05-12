import Hyperdrive from 'hyperdrive';
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';

const store = new Corestore('./storage');
const drive = new Hyperdrive(store);
const swarm = new Hyperswarm();

swarm.on('connection', (conn) => {
	console.log('connection');
	store.replicate(conn);
});

// test script to give us a drive to look at

await drive.put('/blob.txt', Buffer.from('example'));

console.log('key', drive.key.toString('hex'));

const discovery = swarm.join(drive.discoveryKey);
await discovery.flushed();
