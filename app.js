const Console = require('bare-console')
const { HTMLServer } = require('cellery-html')
const { app } = require('./views/shell')
const MainView = require('./views/main')
const App = require('./core/app')

const console = new Console()

const appCore = new App()

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
