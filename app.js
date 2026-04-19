const Console = require('bare-console')
const { HTMLServer } = require('cellery-html')
const { command, flag } = require('paparam')

const { app } = require('./views/shell')
const MainView = require('./views/main')
const App = require('./core/app')
const { getPear } = require('./pear')
const pkg = require('./package.json')
const { name, productName } = pkg
const appName = productName ?? name

const cmd = command(
  appName,
  flag('--storage <dir>', 'pass custom storage to pear-runtime'),
  flag('--no-updates', 'start without OTA updates')
)

cmd.parse()

const pearStore = cmd.flags.storage
const updates = cmd.flags.updates

const console = new Console()

const pear = getPear(pearStore, updates)
const appCore = new App(pear)

const server = new HTMLServer({
  target: { port: 0, width: 1200, height: 800, title: 'GhostDrive' },
  app,
  streams: [appCore.stream],
  onerror: console.error
})

const view = new MainView({ app: appCore })
appCore.view = view

server.ready().then(async () => {
  console.log('Server ready')

  await appCore.ready()
})
