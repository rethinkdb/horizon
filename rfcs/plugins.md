# Horizon plugins

Plugins are intended to allow the horizon backend to be extended in a
modular way, giving users of horizon new capabilities with a minimum
of configuration.

Plugins aren't primarily aimed at apps that embed Horizon (import it
in Node), they're intended allow extending backendless apps (ones that
use `hz serve`) with new functionality.

Plugins should not step on each other and it should be
easy for a user to add many plugins without plugins interacting with
each other in hard to reason about ways.

Plugins are intended to be flexible enough to implement things like:

 - GraphQL endpoints ([#125](https://github.com/rethinkdb/horizon/issues/125))
 - REST endpoints ([#510](https://github.com/rethinkdb/horizon/issues/510))
 - Custom horizon commands ([#337](https://github.com/rethinkdb/horizon/issues/337))
 - Custom authentication methods ([#428](https://github.com/rethinkdb/horizon/issues/428))
 - Server side rendering ([#249](https://github.com/rethinkdb/horizon/issues/249))

## Things plugins can do

Phase 1:
 - Add new `hz` cli commands
 - Add a new http route

Phase 2:
 - Add new horizon request types useable by the client
 - Add new horizon authentication methods useable by the client

## Things plugins can't do

 - hook into websocket request types it didn't define
 - respond to requests to http routes it didn't define
 - modify state of other plugins
 - see configuration options for other plugins

If you need to do any of these things, embedding Horizon is your best bet.

Critically, plugins should not be thought of as middleware, being
injected into a stack of plugins each of which potentially modifies
everything the server does. Rather, they're intended to be
compartmentalized, and responsible only for the capabilities they add.

Conflicts between plugins should be easy to determine from their
specification (say if two plugins take over the same http path).

## Plugin interface

 - NPM modules with the keyword 'horizon-plugin'
 - export an object that has one or more of the following properties defined on it:
   - `activate`: Called once before the plugin is activated [activate](#activate)
   - `deactivate`: Called once before the plugin is deactivated [deactivate](#deactivate)
   - `commands` for extending the `hz` command line tool [commands](#commands)
   - `configOptions` for validating configuration options from the config
     file and environment variables. [config options](#config-options)

### Overview

Horizon commands

### Config Options

The `configOptions` plugin property contains a an object with keys
which are valid config option names (see below) and values which are
Joi validators.

Example:
```js
configOptions: {
    foo_bar: Joi.string()
}
```

This will cause Horizon to allow a `foo_bar` key for the plugin in
`config.toml`, it will receive the value of the env variable
`HZP_PLUGINNAME_FOO_BAR`.

**Note**: Command line options (e.g. `hz myCommand --foo-bar=baz`)
  will not be validated by this Joi schema, since argParse provides
  that ability on its own. See the [commands](#commands) section.

Config options are merged between config file options for the plugin,
environment variables for the plugin, and command-line options
passed. Config file settings have the lowest precedence, environment
variables have the second lowest precedence, and command line options
override everything.

Naming:
- Valid config names must be `/[a-z_]+/`
- Valid config setting names must be `/[a-z0-9_]+/`
- Valid environment variables must be `/HZP_CONFIGNAME_[A-Z0-9_]+/`
  - `CONFIGNAME` here must be the uppercase version of the config name
  specified in the config file.
- Valid command line flags must be `/[a-z\-]+/`

These naming conventions allow Horizon to coalesce the same option
together.

Example config file (plugin is named `graphql`)

```toml
[plugins.graphql]
foo_bar = "baz"
```

Example environment variable (note the `HZP`):

```bash
HZP_GRAPHQL_FOO_BAR=baz
```

Example command-line option:

```bash
--foo-bar=baz
```

### Commands

The `commands` plugin property must be an object or list of objects
with the following properties:
  - `helpText`: a short description of what the command does. Mandatory.
  - `addArguments`: a function that receives the
    [argparse parser](http://nodeca.github.io/argparse/#HelpFormatter.prototype.addArgument)
    for the current command, and adds any options to that parser. This
    can include creating
    [subparsers](http://nodeca.github.io/argparse/#ArgumentParser.prototype.addSubparsers)
    - The default is a no-op function.
    - Optional, the command does not have to take command-line arguments.
  - `runCommand`: a function that receives the merged result of config file options,
    environment variables, and command line options for the plugin as its first argument
    and a `done` function as its second argument. It should execute its task, calling
    `done` with nothing if successful, or with an error if something goes wrong.
    - Note: it should *not* call `process.exit`.
    - Mandatory option, since this is the entire point of the command.

The command added will be called using the configured name for the plugin.

Note that the command will not ever have `activate` or `deactivate`
called, those functions are for server plugins.


### Activate

The activate function is called when initializing the plugin in the
server. It is not invoked for `hz` commands.

The `activate` plugin property must be present and contain a function
that accepts an object with the following properties:
  - `config`: config options from the config.toml section for the
    plugin. This includes user overrides which are not specified in
    the `config` plugin property.
  - `metadata`: the
  - `done`: a callback to be called with the result when the plugin is
    ready.

The `done` function should be called with an object which describes
the route and requests to add to the Horizon server. This object will
be passed to `deactivate` later.  Recognized fields are:
  - `httpRoute`: specifies the http route that will be owned by the plugin [Http route](#http-route)
  - `requests`: specified new request types to accept over the websocket connection [requests](#requests)


#### HTTP route

The `httpRoute` property contains an object with a field which
determines the route which the plugin will be responsible for. The
object has one key and one value. The key is the route, the value is a
function that accepts two arguments:
 - A Node.js http `request` object
 - A Node.js http `response` object

The handler should deal with whatever HTTP methods come to the route,
(e.g. not just `GET`).

Example for a plugin named `graphql`:

```js
httpRoute: {
  'graphQL': (req, res) => {
    res.end('I am at "/graphQL"');
  },
}
```

Notes:
 - The handler is responsible for calling `res.end()`.
 - `request` and `response` are not Express objects.
 - Only one route can be defined. If more are defined, an informative
   error will be thrown.

#### Requests

The `requests` plugin property allows specifying new request types
that can be sent by the client. It The keys of the provided object are
the name of the new request types, the values are objects with the
following properties:
  - `optionsSchema`: optional, a Joi schema to validate a request
  - `handler`: required, a function that receives a validated request,
    and sends any responses.

The schema provided just validates the contents of the `options`
field. So for a schema like:

```js
requests: {
  myRequestType: {
    optionsSchema: Joi.object({
      collection: Joi.string(),
      findAll: Joi.array(Joi.any()),
      myRequestType: Joi.array().ordered(
          Joi.number(), Joi.boolean().default(false))
    }),
    handler: (request, context, send, done) => { ... },
  }
}
```

This will inform the client that it needs to add a method that can be
called like:

``` js
horizon.myRequestType(33, true)
horizon('abc').myRequestType(12)
horizon('abc').myRequestType("string") // server will error
horizon('abc').findAll({ thing: 123 }).myRequestType(22)
// The following will result in an error from the server due to schema validation
horizon.myRequestType() // not enough arguments
horizon.myRequestType(1,2,3) // too many arguments
horizon('abc').find({ id: 12 }).myRequestType(55) // not chainable from `find`
```

The client will do no validation of arguments, so all errors in
arguments will show up as Observable errors.

A raw request might look like:

```js
{
    "request_id": 126,
    "type": "myRequestType",
    "options": {
        "collection": "abc",
        "myRequestType": [ 12 ]
    }
}
```

** Note **
Although the request is chained off built-in methods in Horizon, it
is entirely up to the plugin how to handle the `options.collection`
field, as well as any other keys that it allows itself to be chained from.

##### Handler Function

The handler function is a function of the format:
`(request, context, send, done) => { ... }`
 - `request` is the `options` object from the raw request
 - `context` is an object providing access to info about the current session:
  - `context.user`: the user info for the client session running this request
  - `context.metadata`: the same `Metadata` object provided during `activate`
  - `context.ruleset`: the set of rules which match this request by template
 - `send` is a callback to send a message to the client
 - `done` is a callback to send a final message or error to the client

The handler is not responsible for sending `{ state: complete }` to the client,
calling `done` without an error will send it automatically.  `done` must be
called for each request or there will be a resource leak.

The handler is also responsible for calling validators for checking permissions.
The individual parameters to a validator function are defined differently for
each request type.  This is done by calling `context.ruleset.validate(...)`.

The handler may optionally synchronously return a function which will be called
in the event of an `end_subscription` request (triggered by the client
unsubscribing from the request's Observable).  If provided, this should take
any steps necessary to interrupt the request, this is useful if the handler
makes use of ReQL cursors, for instance.  Additionally, if the request is
interrupted by an `end_subscription`, all matching rules will be removed from
`context.ruleset`, so any further request validation should fail.


### Deactivate

The `deactivate` plugin property must be present and contain a
function that accepts the object passed to the `done` callback of
`activate`. This function should perform any cleanup for resources the
plugin is using (e.g. disconnect any connections, close any files,
stop running processes).

The `deactivate` function is not called for `hz` cli commands.

## User control over plugins

Users may override the `httpRoute` and `requests` names of a plugin in
the plugin section. These options are only available in `config.toml`,
not as environment variables.

As an example, let's assume there is an plugin npm package called
`@horizon/graphql-plugin`. The package internally defines these routes
through its activate function:

```js
{
  httpRoute: { 'graphql': (req, res) => {...} },
  requests: {
    'graphqlA': { ... },
    'graphqlB': { ... },
  }
}
```

The user can remap these routes and requests in their `config.toml` like so:

``` toml
[plugin.graphql]
package = '@horizon/graphql-plugin'
http_route = 'hz/graphql'
requests = {
  'graphqlA' = 'hzGraphqlA',
  'graphqlB' = 'hzGraphqlB',
}
```
