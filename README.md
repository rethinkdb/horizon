<img style="width:100%;" src="/github-banner.png">

# Horizon

[Official Repository](https://github.com/rethinkdb/horizon)

## What is Horizon?

Horizon is an open-source developer platform for building sophisticated realtime
apps. It provides a complete backend that makes it dramatically simpler to
build, deploy, manage, and scale engaging JavaScript web and mobile apps.
Horizon is extensible, integrates with the Node.js stack, and allows building
modern, arbitrarily complex applications.

Horizon is built on top of [RethinkDB](https://www.rethinkdb.com) and consists of
four components:

- [__Horizon server__](/server) -- a middleware server that connects to/is built on
  top of RethinkDB, and exposes a simple API/protocol to front-end
  applications.
- [__Horizon client library__](/client) -- a JavaScript client library that wraps
  Horizon server's protocol in a convenient API for front-end
  developers.
- [__Horizon CLI - `hz`__](/cli) -- a command-line tool aiding in scaffolding, development, and deployment
- [__GraphQL support__](https://github.com/rethinkdb/horizon/issues/125) -- the server will have a GraphQL adapter so anyone can get started building React/Relay apps without writing any backend code at the beginning. This will not ship in v1, but we'll follow up with a GraphQL adapter quickly after launch.

Horizon currently has all the following services available to developers:

- ✅ __Subscribe__ -- a streaming API for building realtime apps directly from the
  browser without writing any backend code.
- ✅ __Auth__ -- an authentication API that connects to common auth providers
  (e.g. Facebook, Google, GitHub).
- ✅ __Identity__ -- an API for listing and manipulating user accounts.
- ✅ __Permissions__ -- a security model that allows the developer to protect
   data from unauthorized access.

Upcoming versions of Horizon will likely expose the following
additional services:

- __Session management__ -- manage browser session and session
  information.
- __Geolocation__ -- an API that makes it very easy to build
  location-aware apps.
- __Presence__ -- an API for detecting presence information for a given
  user and sharing it with others.
- __Plugins__ -- a system for extending Horizon with user-defined services
  in a consistent, discoverable way.
- __Backend__ -- an API/protocol to integrate custom backend code with
  Horizon server/client-libraries.

## Why Horizon?

While technologies like [RethinkDB](http://www.rethinkdb.com) and
[WebSocket](https://en.wikipedia.org/wiki/WebSocket) make it possible to build
engaging realtime apps, empirically there is still too much friction for most
developers. Building realtime apps now requires understanding and manually
orchestrating multiple systems across the software stack, understanding
distributed stream processing, and learning how to deploy and scale realtime systems. The
learning curve is quite steep, and most of the initial work involves boilerplate
code that is far removed from the primary task of building a realtime app.

Horizon sets out to solve this problem. Developers can start building
apps using their favorite front-end framework using Horizon's APIs
without having to write any backend code.

Since Horizon stores data in RethinkDB, once the app gets sufficiently
complex to need custom business logic on the backend, developers can
incrementally add backend code at any time in the development cycle of
their app.

## Get Involved

We'd love for you to help us build Horizon. If you'd like to be a contributor,
check out our [Contributing guide](/CONTRIBUTING.md).

Also, to stay up-to-date on all Horizon related news and the community you should
definitely [join us on Slack](http://slack.rethinkdb.com) or [follow us on Twitter](https://twitter.com/horizonjs).

![](/assets/Lets-go.png)

## FAQ

Check out our FAQ at [horizon.io/faq](https://horizon.io/faq/)

### How will Horizon be licensed?

The Horizon server, client and cli are available under the MIT license
