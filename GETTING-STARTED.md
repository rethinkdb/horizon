![](/horizon.png)

# Getting Started with Horizon

**Getting Started**
* [Installation](#installation)
* [Creating your first app](#creating-your-first-app)
* [Starting Horizon Server](#starting-horizon-server)
 * [Configuring Horizon Server](#configuring-horizon-server)
 * [Adding OAuth authentication](#adding-oauth-authentication)
* [Intro to the Horizon Client Library](#the-horizon-client-library)
 * [Storing documents](#storing-documents)
 * [Retrieving documents](#retrieving-documents)
 * [Removing documents](#removing-documents)
 * [Watching for changes](#watching-for-changes)
* [Putting it all together](#putting-it-all-together)
* [Using an already existing application with Horizon](#bringing-your-app-to-horizon)
 * [Do I need to move all my files into the `dist` folder?](#do-i-need-to-output-all-my-files-into-the-dist-folder)
 * [How do I add Horizon to X?](#how-do-i-add-horizon-to-x)



**Examples**
* [Example Horizon Applications](#example-applications)
* [Extending Horizon Server examples](#extending-horizon-server)

---

## Installation

First, install horizon from npm:

```sh
$ npm install -g horizon
```

## Creating your first app

Now you can initialize a new horizon project:

```sh
$ hz init example-app
```

This will create a directory with the following files:

```sh
$ tree -aF example-app/
example-app/
├── dist/
│   └── index.html
├── .hz/
│   └── config.toml
└── src/
```

The `dist` directory is where you should output your static
files. Horizon doesn't have any opinions about what front-end build
system you use, just that the files to serve end up in `dist`. Your
source files would go into `src` but that's just a convention.
Horizon doesn't touch anything in `src`.

If you want, you can `npm init` or `bower init` in the `example-app`
directory to set up dependencies etc.

`.hz/config.toml` is a [toml](https://github.com/toml-lang/toml) configuration file where you can set all the different options for Horizon Server. [Read more about available configuration options here](/cli/README.md#hzconfigtoml-file).

By default, horizon creates a basic `index.html` to serve so you can verify everything is working:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="/horizon/horizon.js"></script>
    <script>
      var horizon = Horizon();
      horizon.onReady(function() {
        document.querySelector('h1').innerHTML = 'It works!'
      });
      horizon.connect();
    </script>
  </head>
  <body>
   <marquee><h1></h1></marquee>
  </body>
</html>
```

---

## Starting Horizon Server

We now need to start Horizon Server. Running `hz serve` does three main things:

1. Starts the Horizon Server node app which serves the Horizon Client API / WebSocket endpoint.
1. Serves the `horizon.js` client library.
1. Serves everything in the `dist` folder, _if it exists in the current working directory_.

*[RethinkDB](https://www.rethinkdb.com/docs/install/) needs to be installed first and accessible from the Path.*

Normally, running `hz serve` requires a running instance of RethinkDB as well as pre-created tables in your RethinkDB instance.

Luckily, running `hz serve --dev` has all that covered for you. Here's a comparison of what happens with and without `--dev`:

|  | `hz serve`| `hz serve --dev` | Command-line Flag                 |
|----------------------------|:-----------:|:-----:|----------------------|
|Starts Horizon Server       | ✅        | ✅  |                      |
|Starts RethinkDB Server     | ❌        | ✅  | `--start-rethinkdb`  |
|Insecure Mode (no HTTPS/WSS)| ❌        | ✅  | `--insecure`         |
|Auto creates tables         | ❌        | ✅  | `--auto-create-table`|
|Auto creates indexes        | ❌        | ✅  | `--auto-create-index`|

So when using `hz serve --dev`, you don't have to worry about explicitly creating tables, or  worry about creating indexes to ensure your Horizon queries are always fast. As well, Horizon will start an instance of RethinkDB specifically for Horizon and create a `rethinkdb_data` folder in your current directory when you start `hz serve --dev`

> Using authentication _requires_ that you use TLS. To setup authentication for your app you will have to use `hz serve` without `--dev` and with `--key-file` and `--cert-file` flags as well as any other options you require.

Here you can find
<a href="https://github.com/rethinkdb/horizon/tree/next/cli#hz-serve">the complete list of command line flags</a> for `hz serve` ➡️.

On your local dev machine, you will usually use `hz serve --dev` which will begin a new instance of RethinkDB for you and will automatically create tables and indexes making your development workflow easy. In a production environment, you will want to just use `hz serve` and make use of the `.hz/config.toml` file.

### Configuring Horizon Server

Horizon Server is configurable via the `.hz/config.toml` file which is in the [toml](https://github.com/toml-lang/toml) config format. By default, `hz serve` will look for this file
in the current working directory. Here is [an example `.hz/config.toml` file from the Horizon CLI documentation](/cli/README.md#hzconfigtoml-file) ➡️.

> Be warned that there is a precedence to config file setting in the order of:
> environment variables > config file > command-line flags

### Adding OAuth authentication

With Horizon, we wanted to make it easy to allow your users to authenticate with the accounts
they already have with the most popular services.

You can find [a full list of OAuth implementations we support here](/server/src/auth).

The first thing you need to do is create an application with the provider you'd like to authenticate with, usually at the developer portal portion of their website. Here are links
 to a the providers we currently support.

* 😵📖 - [Facebook](https://developers.facebook.com/apps/)
* 💻🏦 - [Github](https://github.com/settings/applications/new)
* 🔟<sup>100</sup> - [Google](https://console.developers.google.com/project)
* 🎮📹 - [Twitch](https://www.twitch.tv/kraken/oauth2/clients/new)
* 🐦💬 - [Twitter](https://apps.twitter.com/app/new)

From each of these providers you will eventually have a `client_id` and `client_secret`
(sometimes just `id` and `secret`) that you will need to put into the `.hz/config.toml`
configuration file.

Near the bottom of the automatically generated `.hz/config.toml` file you'll see commented out
sample OAuth settings, you'll just need to uncomment them out and replace the values with your `client_id` and `client_secret`. Adding Github OAuth configuration would look like this:

```toml
# [auth.facebook]
# id = "000000000000000"
# secret = "00000000000000000000000000000000"
#
# [auth.google]
# id = "00000000000-00000000000000000000000000000000.apps.googleusercontent.com"
# secret = "000000000000000000000000"
#
# [auth.twitter]
# id = "0000000000000000000000000"
# secret = "00000000000000000000000000000000000000000000000000"
#

[auth.github]
id = "your_client_id"
secret = "your_client_secret"
```

Once you've added the lines in your `.hz/config.toml` you're basically all set. To verify that
Horizon Server picked them up, run `hz serve` then go to
`https://localhost:8181/horizon/auth_methods` (or where ever you are running Horizon Server) to
see a list of currently active authentication options.

> At this point, ensure that you're using `--key-file` and `--cert-file` with `hz serve` as you cannot have authentication without also using TLS to serve assets via HTTPS/WSS. Also ensure that you are now using `https://` for all your URLs.

You should see `github` included in the object of available auth methods, if you just see a blank object like so `{ }`, ensure that you restarted Horizon Server and that it is using the `.hz/config.toml` you edited. It should look like this:

```js
{
  github: "/horizon/github"
}
```

Now the value of the property `github` is the path to replace on the current `window.location`
that will begin the authentication process. Or, just type in
`https://localhost:8181/horizon/github` in your browser to test it out.

As a result of a successful authentication, the browser will be redirected to the root of the
dev server (`https://localhost:8181/`) with the `?horizon_token=` in the query parameters and you
can now consider the user properly authenticated at this point. If an error occurs somewhere
during the authentication process, the browser will be redirected back to the root of the dev server with an error message in the query parameters.

A couple notes to mention:

* ***Where is the user data from authenticating with OAuth?***: At the moment we just
allow users to prove they have an account with the given provider. But obviously part of the
power of OAuth is the convenience of sharing controlled slices of user data. For example, I may want users to allow my app to have access to their friends list, or see who they're following on Github. This is coming soon, and in the future, we will allow developers to specify the requested authentication scopes and give developer access to the returned data via the Users table.

* ***Why can't I configure the final redirect url?***: Customizing the final redirect_url on the
original domain will be possible in the future.

* ***Why doesn't Horizon use Passport?***: Passport was definitely considered for Horizon but
ultimately was too heavily tied with Express to achieve the amount of extensibility we wanted.
To ensure this extensibility we decided to implement our own handling of OAuth routes for
the different providers. If you're still convinced we should use Passport, feel free to
[open an issue](https://github.com/rethinkdb/horizon/issues/new) and direct your comments
to @Tryneus.

---

## The Horizon Client Library

In the boilerplate created by `hz init`, you can see that the Horizon client library is being
imported from the path `/horizon/horizon.js` served by Horizon Server. If you


```html
...
<head>
  ...
  <script src="/horizon/horizon.js"></script>
</head>
...
```

After this script is loaded, you can connect to your running instance of Horizon Server.


```js
const horizon = Horizon();
```

From here you can start to interact with Horizon collections. Having `--dev` mode enabled on
the Horizon Server creates collections and indexes automatically so you can get your
application setup with as little hassle as possible.

> **Note:** With `--dev` mode enabled or `--auto-create-index`, indices will
be created automatically for queries that are run that don't already match
a pre-existing query.

```js
// This automatically creates
const chat = horizon("messages");
```

Now, `chat` is a Horizon collection of documents. You can perform a
variety of operations on this collection to filter them down to the ones
you need. This most basic operations are [`.store`][store] and [`.fetch`][fetch]:

### Storing documents

To store documents into the collection, we use [`.store`][store].

```js
// Object being stored
let message = {
  text: "What a beautiful horizon 🌄!",
  datetime: new Date(),
  author: "@dalanmiller"
}

// Storing a document
chat.store(message);
```

If we wanted, we could also add `.subscribe` at the end of [`.store`][store] and handle the document `id`s created by the server as well as any errors that occur with storing. Check out [`.store`](https://github.com/rethinkdb/horizon/tree/next/client#store-------) in the [Horizon Client docs](https://github.com/rethinkdb/horizon/tree/next/client) ➡️.

### Retrieving documents

To retrieve messages from the collection we use [`.fetch`][fetch]. In this case, `.subscribe` takes a result and error handler function.

```js
chat.fetch().subscribe(
  (items) => {
    items.subscribe((item) => {
      // Each result from the chat collection
      //  will pass through this function
      console.log(item);
    })
  },
  // If an error occurs, this function
  //  will execute with the `err` message
  (err) => {
    console.log(err);
  })
```

### Removing documents

To remove documents from a collection, you can use either [`.remove`][remove] or [`.removeAll`][removeAll]:

```js
// These two queries are equivalent and will remove the document with id: 1.
chat.remove(1).subscribe((id) => { console.log(id) })
chat.remove({id: 1}).subscribe((id) => {console.log(id)})
```

Or, if you have a set of documents that you'd like to remove you can pass them in as an array to [`.removeAll`][removeAll].

```js

// Will remove documents with ids 1, 2, and 3 from the collection.
chat.removeAll([1, 2, 3])
```
As with the other functions, you can chain `.subscribe` onto the remove functions and provide response and error handlers.

### Watching for changes

We can also "listen" to an entire collection, query, or a single document by using [`.watch`][watch].
This is very convenient for building apps that want to update state immediately as data changes
in the database. Here are a few variations of how you can use [`.watch`][watch]:

```js
// Watch all documents, if any of them change, call the handler function.
chat.watch().subscribe((docs) => { console.log(docs)  })

// Query all documents and sort them in ascending order by datetime,
//  then if any of them change, the handler function is called.
chat.order("datetime").watch().subscribe((docs) => { console.log(docs)  })

// Find a single document in the collection, if it changes, call the handler function
chat.find({author: "@dalanmiller"}).watch().subscribe((doc) => { console.log(doc) })
```

By default, the handler you pass to `.subscribe` chained on [`.watch`][watch] will receive
the entire collection of documents when one of them changes. This makes it easy when
using frameworks such as [Vue](https://vuejs.org/) or [React](https://facebook.github.io/react/)
allowing you to replace the current state with the new array given to you by Horizon.

```js

// Our current state of chat messages
let chats = [];

// Query chats with `.order` which by default
//  is in ascending order.
chat.order("datetime").watch().subscribe(

  // Returns the entire array
  (newChats) => {

    // Here we replace the old value of `chats` with the new
    //  array. Frameworks such as React will re-render based
    //  on the new values inserted into the array. Preventing you
    //  from having to do modifications on the original array.
    //
    // In short, it's this easy! :cool:
    chats = newChats;
  },

  (err) => {
    console.log(err);
  })
```

To learn more about how Horizon works with React, check out [this complete Horizon & React example](https://github.com/rethinkdb/horizon/tree/next/examples/react-chat-app) ➡️.

## Putting it all together

Now that we have the basics covered, let's pretend we are building a
simple chat application where the messages are displayed
in ascending order. Here are some basic functions that would allow
you to build such an app.

```js

let chats = [];

// Retrieve all messages from the server
const retrieveMessages = () => {
  chat.order('datetime')
  // fetch all results as an array
  .fetch()
  // Retrieval successful, update our model
  .subscribe((newChats) => {
      chats = chats.concat(newChats);
    },
    // Error handler
    error => console.log(error),
    // onCompleted handler
    () => console.log('All results received!')
    )
};

// Retrieve an single item by id
const retrieveMessage = id => {
  chat.find(id).fetch()
    // Retrieval successful
    .subscribe(result => {
      chats.push(result);
    },
    // Error occurred
    error => console.log(error))
};

// Store new item
const storeMessage = (message) => {
   chat.store(message)
    .subscribe(
      // Returns id of saved objects
      result => console.log(result),
      // Returns server error message
      error => console.log(error)
      // called when store is complete
      () => console.log('completed store')
    )
};

// Replace item that has equal `id` field
//  or insert if it doesn't exist.
const updateMessage = message => {
  chat.replace(message);
};

// Remove item from collection
const deleteMessage = message => {
  chat.remove(message);
};
```

And lastly, the [`.watch`][watch] method basically creates a listener on the chat collection. Using just `chat.watch()`, and the new updated results will be pushed to you any time they change on the server. You can also [`.watch`][watch] changes on a query or a single document.


```js

chat.watch().subscribe(chats => {
  // Each time through it will returns all results of your query
    renderChats(allChats)
  },

  // When error occurs on server
  error => console.log(error)
)
```

You can also get notifications when the client connects and disconnects from the server

``` js
  // Triggers when client successfully connects to server
  horizon.onReady().subscribe(() => console.log("Connected to Horizon Server"))

  // Triggers when disconnected from server
  horizon.onDisconnected().subscribe(() => console.log("Disconnected from Horizon Server"))
```

From here, you could take any framework and add these functions to create a realtime chat application
without writing a single line of backend code.

There's also plenty of other functions in the Horizon Client library to meet your needs, including:
[above][above], [below][below], [limit][limit], [replace][replace], and [upsert][upsert].


## Bringing your app to Horizon

We expect many people to already have an application in place but want to leverage
the power of Horizon for their realtime data. Here are a few scenarios that will
be relevant to you:

### Do I need to output all my files into the `dist` folder?

The short and long answer is, **_no_**.

If you are already using some other process to serve your static files, you absolutely
do not need to now do Yet Another Refactor™️ just to get the power of Horizon. From your already existing code base you have two options to get include and then `require` the Horizon Client library:

1. Use `horizon.js` served by Horizon Server (simplest option)
1. Install `@horizon/client` as a dependency in your project

We recommend using the `horizon.js` library as served by Horizon Server for solely the
reason that there will be no mismatches between your client library version and your
current running version of Horizon Server.

This means somewhere in your application, you'll need to have:

```html
<script src="localhost:8181/horizon/horizon.js"></script>
```

And then when you init the Horizon connection you need to specify the `host` property:

```js
const horizon = Horizon({host: 'localhost:8181'});
```

However, if requesting the .js library at page load time isn't desirable, or you are using [webpack](https://webpack.github.io/) and similar build setups for your front-end code, just add `npm install @horizon/client` to your project, and dependency wise, you'll be good to go.

Just remember that when you make connections to Horizon Server to specify the port number (which is by default `8181`) when connecting.

> **Note:** This will likely require setting CORS headers on the Horizon Server responses, which is a feature in progress, refer to [issue #239 for progress](https://github.com/rethinkdb/horizon/issues/239).

### How do I add Horizon to X?

If you already have a React, Angular, or Whatever Is Cool These Days:tm: application, you should first check our [examples directory](/examples) for different ways on how we have integrated Horizon into these frameworks.

---

## Example Applications

To show how Horizon fits with your framework of choice, we've put together a handful of
example applications to help you get started.

<img src="https://i.imgur.com/XFostB8.gif" align="right" width="450px">

* [Horizon Repo Examples Directory](https://github.com/rethinkdb/horizon/tree/next/examples)
 * [CycleJS Chat App](https://github.com/rethinkdb/horizon/tree/next/examples/cyclejs-chat-app)
 * [RiotJS Chat App](https://github.com/rethinkdb/horizon/tree/next/examples/riotjs-chat-app)
 * [React Chat App](https://github.com/rethinkdb/horizon/tree/next/examples/react-chat-app)
 * [React TodoMVC App](https://github.com/rethinkdb/horizon/tree/next/examples/react-todo-app)
 * [Vue Chat App](https://github.com/rethinkdb/horizon/tree/next/examples/vue-chat-app)
 * [Vue TodoMVC App](https://github.com/rethinkdb/horizon/tree/next/examples/vue-todo-app)


## Extending Horizon Server

We also have a few examples of how you can extend Horizon Server. We imagine that once your application
grows beyond the needs of simply providing the Horizon Client API, you'll want to expand and build upon
Horizon Server. Here are a few examples of how to extend Horizon Server with some popular Node web frameworks.

* [Extending with Koa Server](https://github.com/rethinkdb/horizon/tree/next/examples/koa-server)
* [Extending with Hapi Server](https://github.com/rethinkdb/horizon/tree/next/examples/hapi-server)
* [Extending with Express Server](https://github.com/rethinkdb/horizon/tree/next/examples/express-server)

[above]: https://github.com/rethinkdb/horizon/tree/next/client#above-limit-integer--key-value-closed-string-
[below]: https://github.com/rethinkdb/horizon/tree/next/client#below-limit-integer--key-value-closed-string-
[Collection]: https://github.com/rethinkdb/horizon/tree/next/client#collection
[fetch]: https://github.com/rethinkdb/horizon/tree/next/client#fetch
[find]: https://github.com/rethinkdb/horizon/tree/next/client#find---id-any-
[findAll]: https://github.com/rethinkdb/horizon/tree/next/client#findall--id-any----id-any--
[Horizon]: https://github.com/rethinkdb/horizon/tree/next/client#horizon
[limit]: https://github.com/rethinkdb/horizon/tree/next/client#limit-num-integer-
[order]: https://github.com/rethinkdb/horizon/tree/next/client#order---directionascending-
[remove]: https://github.com/rethinkdb/horizon/tree/next/client#remove-id-any--id-any-
[removeAll]: https://github.com/rethinkdb/horizon/tree/next/client#removeall--id-any--id-any-----id-any---id-any---
[replace]: https://github.com/rethinkdb/horizon/tree/next/client#replace--
[store]: https://github.com/rethinkdb/horizon/tree/next/client#store-------
[store]: https://github.com/rethinkdb/horizon/tree/next/client#store-------
[upsert]: https://github.com/rethinkdb/horizon/tree/next/client#upsert------
[watch]: https://github.com/rethinkdb/horizon/tree/next/client#watch--rawchanges-false--
