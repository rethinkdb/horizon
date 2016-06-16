# Horizon plugins

Plugins are intended to allow the horizon backend to be extended in a
modular way, giving users of horizon new capabilities with a minimum
of configuration.

Plugins are intended to be flexible enough to implement things like:

 - GraphQL endpoints ([#125](https://github.com/rethinkdb/horizon/issues/125))
 - REST endpoints ([#510](https://github.com/rethinkdb/horizon/issues/510))
 - Custom horizon commands ([#337](https://github.com/rethinkdb/horizon/issues/337))
 - Custom authentication methods ([#428](https://github.com/rethinkdb/horizon/issues/428))
 - Server side rendering ([#249](https://github.com/rethinkdb/horizon/issues/249))
 - Worker processes ([#368](https://github.com/rethinkdb/horizon/issues/368))
 - Scheduled tasks ([#311](https://github.com/rethinkdb/horizon/issues/311))

## Things plugins can do
 - Add new configuration options
 - Add new `hz` commands
 - Add a new http route
 - Add new helper functions available to validators
 - Spawn supervised processes
 - Add new horizon request types useable by the client

## Things plugins can't do

 - hook into websocket request types it didn't define
 - respond to requests to http routes it didn't define
 - modify state of other plugins
 - override validation results
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
 - export an object with the name 'plugin' that has one or more of the
   following properties defined on it:
   - `name`: a name for the plugin. Defaults to the package name
   - `command` for extending the `hz` command line tool [command](#command)
   - `processes`: specifies subprocesses to spawn [processes](#processes)
   - `httpRoute`: specifies the http route that will be owned by the plugin [Http route](#http-route)
   - `config`: specifies new configuration options [config](#config)
   - `env`: specifies environment variables the plugin cares about [environment vars](#environment-vars)
   - `requests`: specified new request types to accept over the websocket connection [requests](#requests)
   - `validationHelpers`: specifies helper functions to inject into the validation context [validationHelpers](#validation-helpers)
   - `activate`: Called once before the plugin is activated [activate](#activate)
   - `deactivate`: Called once before the plugin is deactivated [deactivate](#deactivate)

### Command

The `command` plugin property must be an object with the following
properties:
  - `name`: a string with the name of the command to
    implement. Defaults to an underscore-to-hyphen converted version
    of the npm package name of the plugin
  - `helpText`: a short description of what the command does. Mandatory.
  - `addArguments`: a function that receives the
    [argparse parser](http://nodeca.github.io/argparse/#HelpFormatter.prototype.addArgument)
    for the current command, and adds any options to that parser. This
    can include creating
    [subparsers](http://nodeca.github.io/argparse/#ArgumentParser.prototype.addSubparsers)
    - default is a no-op function
  - `processConfig`: a function that receives:
   1. the final result of the parsed options from the command line
   2. an object representing the plugin's [config options](#config) that were in the config.toml file
   3. an object with the values of any environment variables the plugin cares about
    any. It returns the final options, merging command line and config
    options any way it wants to.
    - default is a function that merges the config, env and command
      line arguments in a precedence order the same way built in
      commands do.
  - `runCommand`: a function that receives the merged result of
    `processConfig` as its first argument and a `done` function as its
    second argument. It should execute its task, calling `done` with an error if something goes wrong.
    - Note: it should *not* call `process.exit`.
    - Mandatory option, since this is the entire point of the command.

Note that the command will not ever have `activate` or `deactivate`
called, those functions are for server plugins.

### Config

The `config` plugin property specifies which config options will be
forwarded from the config file section for the plugin. The value
should be a
[Joi validator](https://github.com/hapijs/joi/blob/master/API.md) to
validates the config options.

So a `config` key like:

```js
config: {
   someKey: Joi.boolean(),
   some_other_key: Joi.string(),
   another: Joi.string().default('foo'),
}
```

Will allow the following section in `config.toml`:

```toml
[plugin.my-plugin-name]
someKey = true
some_other_key = 'some kinda string'
```

The values from this config section will be passed to both the
`processConfig` function for commands, as well as the
[`activate`](#activate) function for server plugins. The object passed
will look like:

```js
{ someKey: true,
  some_other_key: 'some_kinda_string',
  another: 'foo',
}
```

### HTTP route

The `httpRoute` plugin property is an object with a single key
defining the http route the plugin will receive requests from. The
value is the request handler for the route. The function receives
three arguments:
 - An Express `request` object
 - An Express `response` object
 - A state object of whatever kind is returned by the plugin's
   [activate](#activate) function

The handler should deal with whatever HTTP methods come to the route.

Example:

```js
httpRoute: {
    'hello-world': (req, res, state) => {
        res.send(`Hello ${state.value}`);
            res.end()
    },
}
```

Notes:
 - The handler is responsible for calling `res.end()`.
 - The route is a hard-prefix from the root of the horizon server address.
  - It cannot clash with any other other loaded plugin routes (no
    overlapping)
      - If multiple routes need to be handled, the r
      - Example, if you want to create a REST plugin, you need to
        specify the route as something like `rest` and the endpoints
        underneath it like `/rest/users` `/rest/vehicles` etc.
  - It cannot clash with the route horizon uses itself (usually
    `"horizon"`)
 - In the configuration, the user may override the httpRoute for the
   plugin, and the plugin must behave properly.
 - Express 4.0 api for request and response objects

### Processes

The `processes` plugin property is an object with keys that correspond
to process titles, and values which are objects with 2 properties:
 - `run`: a function receiving the plugin state that runs as the main
   thread of the process. It should not spawn processes itself
 - `cleanup`: a function receiving the plugin state that cleans up the
   process

### Environment vars

The `env` plugin property is an object from keys with environment
variables, and Joi validators for values.

Example:
```js
env: {
  'MY_ENV_VALUE': Joi.any().allow('yes', 'no').default('no')
}
```

The values of env variables that successfully validate are passed to
the [activate](#activate) function as well as to the `processConfig` function for any [command](#command).

**Note**:

The env vars declared here will be validated to ensure no other plugin
declares them. If a plugin wants to make use of externally defined env
variables like `$PATH` etc, and doesn't want to mutual exclusivity to be enforced by Horizon, it can just access `process.env` like normal.

### Validation helpers

The `validationHelpers` plugin property is an object containing
functions that will be made available in the validation context. There
are no restrictions on the types of the functions here

Example:
```js
validationHelpers: {
 isTruthy(val) { return !!val }
}
```

This will make the `isTruthy` function available to the `validators`
functions specified in `.hz/config.toml`:

```toml
[groups.authenticated.rules.foo]
validator = """
  function(context, oldValue, newValue) {
    return isTruthy(newValue.isFoo)
  }
"""
```

### Requests

The `requests` plugin property allows specifying new request types
that can be sent by the client. The keys of the provided object are
the name of the new requests, the values are an object with the
following properties:
  - `optionsSchema`: A Joi schema to validate the request type.
  - `clientValidation`: An object with the keys:
    - `minArgs`: minimum number of arguments accepted
    - `maxArgs`: maximum number of arguments accepted
    - `legalToChainFrom`: a list of terms that can be chained before
      this request method. The special value `"/"` indicates the
      method is available directly on the `horizon`
      instance. `"collection"` indicates it's chainable from a
      collection.
    - `nullable`: a boolean determining whether any arguments can be
      null
  - `handler`: A function that receives a validated request, the
    current plugin state

The schema provided just validates the contents of the `options`
field. So for a schema like:

```js
requests: {
  myRequestType: {
    optionsSchema: {
      collection: Joi.string(),
      findAll: Joi.array(Joi.any()),
      myRequestType: Joi.array().ordered(
          Joi.number(), Joi.boolean().default(false))
    },
    clientValidation: {
      minArgs: 1,
      maxArgs: 2,
      nullable: true,
      legalToChainFrom: [ '/', 'collection', 'findAll' ],
    },
    handler: (requestOptions, pluginState) => { ... },
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
// The following will throw an exception when they are called:
horizon.myRequestType() // not enough arguments
horizon.myRequestType(1,2,3) // too many arguments
horizon('abc').find({ id: 12 }).myRequestType(55) // not chainable from `find`
```

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
Although the request is chained off built in methods in Horizon, it is entirely up to the plugin to do something with the `options.collection`
key here, as well as any other keys that it allows itself to be chained from.

The plugin is responsible for responding to `end_subscription` requests, and for sending `state: complete` to the client if no more results are available for the current request. See the [protocol document](https://github.com/rethinkdb/horizon/blob/next/docs/protocol.md) for details.

### Activate

The `activate` plugin property must be present and contain a function
that accepts an object with the following properties:
  - `config`: config options from the config.toml section for the
    plugin. This includes user overrides which are not specified in
    the `config` plugin property.
  - `env`: an object with relevant environment variables (defined in
    [environment](#environment))
  - `rdbConn`: a function that returns an open rethinkdb connection
    - If the plugin doesn't need a rethinkDB connection, it shouldn't
      call this function

The function should return an object which will be passed to various
other callbacks for the plugin and contains all internal state the
plugin needs to function. This includes keeping a reference to the
rethinkDB connection if necessary.

### Deactivate

The `deactivate` plugin property must be present and contain a function that accepts the current plugin state and frees any resources the plugin is using. (Disconnect any connections, close any files, etc)

## User control over plugins

Users may override some names provided by the plugin:
  - rename the [httpRoute](#http-route) if defined
  - rename any function in [validationHelpers](#validation-helpers)
  - rename any new [request types](#request-types)

Users configure the plugins with a section like:

```toml
[plugin.plugin-name]
httpRoute = "httpRouteOverride",
validationHelpers = {
 isTruthy = "namespacedIsTruthy"
}
requests = {
  foo = "namespacedFoo"
}
# plugin specified options ...
```

Every plugin can always accept the `httpRoute`, `validationHelpers`,
and `requests` keys, even if the plugin specifies no [config](#config)
section. Horizon will respect these renames itself, the plugin doesn't need to do anything based on them. It will still be passed the options though in the [activate](#activate) function, so it can optionally do something if it wants to.

# Open questions:

- Can you instantiate a plugin more than once per app?
- Do we need to provide process monitor options? Stuff like backoff
values and restart limits etc.
