<img style="width:100%;" src="/github-banner.png">

# RethinkDB Fusion

RethinkDB Fusion is an open-source developer platform for building
realtime, scalable web apps. It is built on top of RethinkDB, and
allows app developers to get started with building modern, engaging
apps without writing any backend code.

__NOTE:__ "Fusion" is a codename that we'll likely change in the
future. See https://github.com/rethinkdb/fusion/issues/7.

Fusion consists of two components:

- [__Fusion server__](/server) -- a middleware server that connects to/is built on
  top of RethinkDB, and exposes a simple API/protocol to front-end
  applications.
- [__Fusion client library__](/client) -- a JavaScript client library that wraps
  Fusion server's protocol in a convenient API for front-end
  developers.

The first version of Fusion will expose the following services to
developers:

- __Subscribe__ -- a streaming API for building realtime apps directly from the
  browser without writing any backend code.
- __Auth__ -- an authentication API that connects to common auth providers
  (e.g. Facebook, Google, GitHub).
- __Identity__ -- an API for listing and manipulating user accounts.
- __Permissions__ -- a security model that allows the developer to protect
  the data from unauthorized access.
- __Geolocation__ -- an API that makes it very easy to build
  location-aware apps.
- __Session management__ -- manage browser session and session
  information.
- __Presence__ -- an API for detecting presence information for a given
  user and sharing it with others.

Upcoming versions of Fusion will likely expose the following
additional services:

- __Plugins__ -- a system for extending Fusion with user-defined services
  in a consistent, discoverable way.
- __Backend__ -- an API/protocol to integrate custom backend code with
  Fusion server/client-libraries.

## Why Fusion?

While RethinkDB is poised to be an excellent database for building
realtime apps, empirically there is still too much friction for most
developers. To get started they have to learn ReQL, understand
changefeeds, and figure out how to thread changefeeds through their
backend code. The learning curve is quite steep, and most of the
initial work involves boilerplate code that's pretty far removed from
the primary task of building a realtime app.

Fusion sets out to solve this problem. Developers can start building
apps using their favorite front-end framework using Fusion's APIs
without having to write any backend code.

Since Fusion stores data in RethinkDB, once the app gets sufficiently
complex to need custom business logic on the backend, developers can
incrementally add backend code at any time in the development cycle of
their app.

## FAQ

### How do you start Fusion?

```sh
# Start RethinkDB
$ rethinkdb

# In another terminal, start Fusion
$ fusion --dev

# Clients can connect directly from the browser on port 8181
# The fusion client library is served from host:8181/fusion/fusion.js
```

### What does the code look like?

The API is still in development, but here is currently what you'd write
on the front-end for a hypothetical todo list application:

```js
// Connect to fusion
const fusion = new Fusion('localhost:8181');
const todos = fusion("todo-items");

// Function called when a user adds a todo item in the UI
const createTodo = (newTodo) => {
  todos.insert({
    item: newTodo.text,
    created: new Date()
  });
};

// Listen to updates from other users
const initApp = () => {
  todos.subscribe({
    onAdded: (addedTodo) => {
      // add the new todo to the data model
    }),
    onChanged: (changed) => {
      // update data model with changed.new_val
    },
    onRemoved: (removedTodo) => {
      // remove the item from the data model
    }
  });
};
```
***Want to see more?*** Check out [our README for the Fusion client library](https://github.com/rethinkdb/fusion/tree/next/client#fusion-client-library), we have an initial set of docs as well as a expanded getting started guide to get you started with using Fusion.

### How do I get it?

Right now you have to install it locally from this repo. Follow the guides for [installing the Fusion server](/server#installation) and then read through on how to [import the client library](/client#getting-started) into your project.


### How is Fusion different from Firebase?

There are a few major differences:

- Fusion is open-source. You can run it on your laptop, deploy it to
  the cloud, or deploy it to any infrastructure you want.
- Fusion will allow you to build complex enterprise apps, not just
  basic applications with limited functionality. Since Fusion stores
  data in RethinkDB, once your app grows beyond the basic Fusion API,
  you can start adding backend code of arbitrary complexity that has
  complete access to a fully-featured database.
- Since Fusion is built on RethinkDB, we'll be able to expose services
  that are much more sophisticated than simple document sync
  (e.g. realtime analytics, streams on joined tables, etc.)

### How is Fusion different from Meteor?

Fusion has philosophical and technical differences with Meteor that
will result in vastly different developer experiences.

Fusion is a small layer on top of RethinkDB with a narrow,
purpose-built API designed to make it very easy to get started
building realtime apps without backend code. Fusion isn't prescriptive
-- you can use any front-end framework without any
magic/customizations, and once your app outgrows the Fusion API you
can use any backend technology (e.g. Node.js, Python, Ruby) and any
backend framework (e.g. Rails, Express, Koa, etc.)

By contrast, Meteor is a much more prescriptive framework. Fusion is a
reasonably small component that has a very clean separation with the
database and the frontend, while Meteor is a much more monolithic
experience.

Another major difference is architectural -- Meteor uses a LiveQuery
component built by tailing MongoDB's oplog. This approach is
fundamentally limited -- it's impossible to do many operations
efficiently, and even the basic functionality is extremely difficult
to scale.

Fusion is built on RethinkDB, so the LiveQuery functionality is in the
database. This allows for much more sophisticated streaming operations,
and scalability is dramatically simpler because the database has all
the necessary information to allow for a scalable feeds implementation.

### How will Fusion be licensed?

We still have to figure out the exact license, but Fusion will be
fully open-source (we'll probably use MIT or Apache).
