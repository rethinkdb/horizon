# Horizon plugins

Plugins are intended to allow the horizon backend to be extended in a
modular way, giving users of horizon new capabilities with a minimum
of configuration.

Plugins are intended to be flexible enough to implement things like:

 - GraphQL endpoints (#125)
 - REST endpoints (#510)
 - Custom horizon commands (#337)
 - Custom authentication methods (#428)
 - Server side rendering (#249)
 - Worker processes (#368)
 - Scheduled tasks (#311)

## Things plugins can do
 - Add new configuration options
 - Add new `hz` commands
 - Add new http endpoints
 - Add new horizon request types useable by the client

## Plugin interface
 - NPM modules with the keyword 'horizon-plugin'
 - export an object with the name 'plugin' that has one or more of the
   following properties defined on it:
   - `commands` for extending the `hz` command line tool [commands](#commands)
   - `processes`: specifies subprocesses to spawn [processes](#processes)
   - `endpoints`: specifies http endpoints that will be owned by the plugin [endpoints](#endpoints)
   - `config`: specifies new configuration options [config](#config)
   - `requests`: specified new request types to accept over the websocket connection [requests](#requests)
   - `activate`: Called once before the plugin is activated
   - `deactivate`: Called once before the plugin is deactivated
 - The plugin is required to completely clean itself up in the
   `deactivate` function, leaving no state behind.

### Commands
### Processes
### Endpoints
### Config
### Requests
