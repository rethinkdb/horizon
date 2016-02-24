<img style="width:100%;" src="/github-banner.png">

# RethinkDB Horizon

RethinkDB Horizon is an open-source developer platform for building
realtime, scalable web apps. It is built on top of RethinkDB, and
allows app developers to get started with building modern, engaging
apps without writing any backend code.

Horizon consists of three components:

- [__Horizon server__](/server) -- a middleware server that connects to/is built on
  top of RethinkDB, and exposes a simple API/protocol to front-end
  applications.
- [__Horizon client library__](/client) -- a JavaScript client library that wraps
  Horizon server's protocol in a convenient API for front-end
  developers.
- [__the horizon tool_](/cli) -- a command line tool aiding in scaffolding, development, and deployment

The first version of Horizon will expose the following services to
developers:

- __Subscribe__ -- a streaming API for building realtime apps directly from the
  browser without writing any backend code.
- __Auth__ -- an authentication API that connects to common auth providers
  (e.g. Facebook, Google, GitHub).
- __Identity__ -- an API for listing and manipulating user accounts.
- __Permissions__ -- a security model that allows the developer to protect
  the data from unauthorized access.

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

While RethinkDB is poised to be an excellent database for building
realtime apps, empirically there is still too much friction for most
developers. To get started they have to learn ReQL, understand
changefeeds, and figure out how to thread changefeeds through their
backend code. The learning curve is quite steep, and most of the
initial work involves boilerplate code that's pretty far removed from
the primary task of building a realtime app.

Horizon sets out to solve this problem. Developers can start building
apps using their favorite front-end framework using Horizon's APIs
without having to write any backend code.

Since Horizon stores data in RethinkDB, once the app gets sufficiently
complex to need custom business logic on the backend, developers can
incrementally add backend code at any time in the development cycle of
their app.

## FAQ

### How do you start Horizon?

```sh
$ npm install -g horizon
$ hz init my-app
$ hz serve myapp --dev
# localhost:8181/index.html has a demo page on it
# Horizon client connections can be made to ws://localhost:8181/horizon
# The horizon client library is served from localhost:8181/horizon/horizon.js
```

### What does the code look like?

Here is currently what you'd write on the front-end for a simple todo list application:

```js
// Connect to horizon
const horizon = new Horizon();
const todoCollection = horizon("todo-items");

const todoApp = document.querySelector('#app')

// Function called when a user adds a todo item in the UI
const todoCollection.watch().subscribe( todos => {
  const todoHTML = todos.map(todo =>
    `<div class="todo" id="${todo.id}">
       <input type="checkbox" ${todo.done ? 'checked' : ''}>
       ${todo.text} -- ${todo.date}
     </div>`);
  todoApp.innerHTML = todoHTML.join('');
});
```
***Want to see more?*** Check out [our README for the Horizon client library](https://github.com/rethinkdb/horizon/tree/next/client#horizon-client-library), we have an initial set of docs as well as a expanded getting started guide to get you started with using Horizon.

### How do I get it?

Right now you have to install it locally from this repo. Follow the guides for [installing the Horizon server](/server#installation) and then read through on how to [import the client library](/client#getting-started) into your project.


### How is Horizon different from Firebase?

There are a few major differences:

- Horizon is open-source. You can run it on your laptop, deploy it to
  the cloud, or deploy it to any infrastructure you want.
- Horizon will allow you to build complex enterprise apps, not just
  basic applications with limited functionality. Since Horizon stores
  data in RethinkDB, once your app grows beyond the basic Horizon API,
  you can start adding backend code of arbitrary complexity that has
  complete access to a fully-featured database.
- Since Horizon is built on RethinkDB, we'll be able to expose services
  that are much more sophisticated than simple document sync
  (e.g. realtime analytics, streams on joined tables, etc.)

### How is Horizon different from Meteor?

Horizon has philosophical and technical differences with Meteor that
will result in vastly different developer experiences.

Horizon is a small layer on top of RethinkDB with a narrow,
purpose-built API designed to make it very easy to get started
building realtime apps without backend code. Horizon isn't prescriptive
-- you can use any front-end framework without any
magic/customizations, and once your app outgrows the Horizon API you
can use any backend technology (e.g. Node.js, Python, Ruby) and any
backend framework (e.g. Rails, Express, Koa, etc.)

By contrast, Meteor is a much more prescriptive framework. Horizon is a
reasonably small component that has a very clean separation with the
database and the frontend, while Meteor is a much more monolithic
experience.

Another major difference is architectural -- Meteor uses a LiveQuery
component built by tailing MongoDB's oplog. This approach is
fundamentally limited -- it's impossible to do many operations
efficiently, and even the basic functionality is extremely difficult
to scale.

Horizon is built on RethinkDB, so the LiveQuery functionality is in the
database. This allows for much more sophisticated streaming operations,
and scalability is dramatically simpler because the database has all
the necessary information to allow for a scalable feeds implementation.

### How will Horizon be licensed?

We still have to figure out the exact license, but Horizon will be
fully open-source (we'll probably use MIT or Apache).
