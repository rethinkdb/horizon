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

Version 1:
 - Add new `hz` commands
 - Add a new http route

Version 2:
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
   - `command` for extending the `hz` command line tool [command](#command)

### Config Options

Config options are merged between config file options for the plugin,
environment variables for the plugin, and command-line options, in
order of increasing precedence.

Here is an example showing the same argument set identically in each
of the places.

Config file:
```toml
[plugins.graphql]
foo_bar = "baz"
```

Environment variable (note the `HZP`):
```bash
HZP_GRAPHQL_FOO_BAR=baz
```

Command-line (only when running the `command`):
```bash
--foo=bar
```


### Command

The `command` plugin property must be an object with the following
properties:
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

The `activate` plugin property must be present and contain a function
that accepts an object with the following properties:
  - `config`: config options from the config.toml section for the
    plugin. This includes user overrides which are not specified in
    the `config` plugin property.
  - `metadata`: the 
  - `done`: a callback to be called with the result when the plugin is
    ready.

The `done` function should be called with an object:

The function should return an object which describes how the plugin
wishes to modify the Horizon server.  This object will be passed to
`deactivate` later.  Recognized fields are:
  - `httpRoute`: specifies the http route that will be owned by the plugin [Http route](#http-route)
  - `requests`: specified new request types to accept over the websocket connection [requests](#requests)


#### HTTP route

The `httpRoute` property is an object whose fields define
the http routes the plugin will receive requests from. The
values are request handler functions for each route. The functions
receive three arguments:
 - A `request` object
 - A `response` object

The route field name is appended to the plugin name for all routes.
This field must be either an empty string or begin with a `/`, e.g.
`""`, `"/foo"` to avoid conflicting with other plugins.

The handler should deal with whatever HTTP methods come to the route.

Example for a plugin named `graphql`:

```js
httpRoute: {
  '': (req, res) => {
    res.end('I am at "/graphql"');
  },
  '/foo': (req, res) => {
    res.end('I am at "/graphql/foo"');
  },
}
```

Notes:
 - The handler is responsible for calling `res.end()`.
 - `request` and `response` are not Express objects.


#### Requests

The `requests` plugin property allows specifying new request types
that can be sent by the client. The keys of the provided object are
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
    handler: (request, pluginState) => { ... },
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
function that accepts the object returned by `activate`. This function
should perform any cleanup for resources the plugin is using
(e.g. disconnect any connections, close any files, stop running processes)


## User control over plugins

Users may override the name of a plugin when specifying it in their config.

Example, loading the `horizon-graphql` plugin as `graphql`:
```toml
[plugins.graphql]
package = "horizon-graphql"
# plugin specific options ...
```


# Open questions:

- null
