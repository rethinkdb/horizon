![](/horizon.png)

> **At the moment you need the not-yet-released version 2.3 of RethinkDB due out at the end of the first week of April. Here are Linux and OSX statically-compiled pre-release binaries so you can still get started with Horizon. Make sure the binary takes precedence over your system installed RethinkDB in your path and you will be fine! Otherwise contact @dalanmiller in the RethinkDB #horizon slack channel**

> * Linux -  https://www.dropbox.com/s/j5mo656i2nmsmae/rethinkdb-2.3.0-pre-horizon-x64-linux?dl=1
> * OSX - https://www.dropbox.com/s/z9grxsl9wd84cm8/rethinkdb-2.3.0-pre-horizon-x64-mac?dl=1

# Getting Started with Horizon

**Getting Started**
* [Installation](#installation)
* [Creating your first app](#creating-your-first-app)
* [Intro to the Horizon Client Library](#)
 * [Storing documents](#storing-documents)
 * [Retrieving documents](#retrieving-documents)
 * [Removing documents](#removing-documents)
 * [Watching for changes](#watching-for-changes)
* [Putting it all together](#putting-it-all-together)

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
├── .hzconfig
└── src/
```

The `dist` directory is where you should output your static
files. Horizon doesn't have any opinions about what front-end build
system you use, just that the files to serve end up in `dist`. Your
source files would go into `src` but that's just a convention.
Horizon doesn't touch anything in `src`.

If you want, you can `npm init` or `bower init` in the `example-app`
directory to set up dependencies etc.

`.hzconfig` is a [toml](https://github.com/toml-lang/toml) configuration file where you can set all the different options for Horizon Server. [Read more about available configuration options here](/client/README.md#--hzconfig--file).

By default, horizon creates a basic `index.html` to serve so you can verify everything is working:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="/horizon/horizon.js"></script>
    <script>
      var horizon = Horizon();
      horizon.onConnected(function() {
        document.querySelector('h1').innerHTML = 'It works!'
      });
    </script>
  </head>
  <body>
   <marquee><h1></h1></marquee>
  </body>
</html>
```

---

## Starting Horizon Server

From here, we now need to start the Horizon Server to both serve your static files as well as
start the Node application which serves the Horizon Client API and connects to RethinkDB.

Luckily, running `hz serve --dev` has all that covered for you. Here's a comparison of what happens with and without `--dev`:

|  | `hz serve`| `hz serve --dev` | Command-line Flag                 |
|----------------------------|:-----------:|:-----:|----------------------|
|Starts Horizon Server       | ✅        | ✅  |                      |
|Starts RethinkDB Server     | ❌        | ✅  | `--start-rethinkdb`  |
|Insecure Mode (no HTTPS/WSS)| ❌        | ✅  | `--insecure`         |
|Auto creates tables         | ❌        | ✅  | `--auto-create-table`|
|Auto creates indexes        | ❌        | ✅  | `--auto-create-index`|



Here is
<a href="https://github.com/rethinkdb/horizon/tree/next/cli#hz-serve">the complete list of command line flags</a> for `hz serve` ➡️.

On your local dev machine, you will likely always use `hz serve --dev` which will begin a new instance of RethinkDB for you and will automatically create tables and indexes. However, if you deploy your own [Horizon Cloud](https://github.com/rethinkdb/horizon-cloud), you'll need to setup and configure your own instance of Horizon Server.

### Configuring Horizon Server

Horizon Server is also configurable via the `.hzconfig` file which is in the [toml](https://github.com/toml-lang/toml) config format. By default, `hz serve` will look for this file
in the current working directory. Here is [an example `.hzconfig` file from the Horizon CLI documentation](https://github.com/rethinkdb/horizon/tree/next/cli#hzconfig-file) ➡️.

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
  datetime: new Date()
  author: "@dalanmiller"
}

// Storing a document
chat.store(message);
```

If we wanted, we could also add `.forEach` at the end of [`.store`][store] and handle the document `id`s created by the server as well as any errors that occur with storing. Check out [`.store`](https://github.com/rethinkdb/horizon/tree/next/client#store-------) in the [Horizon Client docs](https://github.com/rethinkdb/horizon/tree/next/client) ➡️.

### Retrieving documents

To retrieve messages from the collection we use [`.fetch`][fetch]. In this case, `.forEach` takes a result and error handler function.

```js
chat.fetch().forEach(
  // Each result from the chat collection
  //  will pass through this function
  (item) => {
    console.log(item);
  },
  // If an error occurs, this function
  //  will execute with the `err` message
  (err) => {
    console.log(err);
  })  
```

Each document of the result `.forEach` will pass individually through the result handler as the results are emitted from the server. If you'd rather handle the entire results array at once, you can add [`.toArray()`][toArray] after [`.fetch()`][fetch] like so:

```js
chat.fetch().toArray().forEach((completeArrayOfResults) => {})
```


### Removing documents

To remove documents from a collection, you can use either [`.remove`][remove] or [`.removeAll`][removeAll]:

```js
// These two queries are equivalent and will remove the document with id: 1.
chat.remove(1).forEach((id) => { console.log(id) })
chat.remove({id: 1}).forEach((id) => {console.log(id)})
```

Or, if you have a set of documents that you'd like to remove you can pass them in as an array to [`.removeAll`][removeAll].

```js

// Will remove documents with ids 1, 2, and 3 from the collection.
chat.removeAll([1, 2, 3])
```
As with the other functions, you can chain `.forEach` onto the remove functions and provide response and error handlers.

### Watching for changes

We can also "listen" to an entire collection, query, or a single document by using [`.watch`][watch].
This is very convenient for building apps that want to update state immediately as data changes
in the database. Here are a few variations of how you can use [`.watch`][watch]:

```js
// Watch all documents, if any of them change, call the handler function.
chat.watch().forEach((docs) => { console.log(docs)  })

// Query all documents and sort them in ascending order by datetime,
//  then if any of them change, the handler function is called.
chat.order("datetime").watch().forEach((docs) => { console.log(docs)  })

// Find a single document in the collection, if it changes, call the handler function
chat.find({author: "@dalanmiller"}).watch().forEach((doc) => { console.log(doc) })
```

By default, the handler you pass to `.forEach` chained on [`.watch`][watch] will receive
the entire collection of documents when one of them changes. This makes it easy when
using frameworks such as [Vue](https://vuejs.org/) or [React](https://facebook.github.io/react/)
allowing you to replace the current state with the new array given to you by Horizon.

```js

// Our current state of chat messages
let chats = [];

// Query chats with `.order` which by default
//  is in ascending order.
chat.order("datetime").watch().forEach(

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

### Putting it all together

Now that we have the basics covered, let's pretend we are building a
simple chat application where the messages are displayed
in ascending order. Here are some basic functions that would allow
you to build such an app.

```js

let chats = [];

// Retrieve all messages from the server
const retrieveMessages = () => {
  chat.order('datetime')
  // fetch all results as an array, rather than one at a time
  .fetch().toArray()
  // Retrieval successful, update our model
  .forEach((newChats) => {
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
    .forEach(result => {
      chats.push(result);
    },
    // Error occurred
    error => console.log(error))
};

// Store new item
const storeMessage = (message) => {
   chat.store(message)
    .forEach( // forEach is an alias of .subscribe
      // Returns id of saved objects
      result => console.log(result),
      // Returns server error message
      error => console.log(error)
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

chat.watch().forEach(chats => {
  // Each time through it will returns all results of your query
    renderChats(allChats)
  },

  // When error occurs on server
  error => console.log(error),
)
```

You can also get notifications when the client connects and disconnects from the server

``` js
  // Triggers when client successfully connects to server
  horizon.onConnected().forEach(() => console.log("Connected to Horizon Server"))

  // Triggers when disconnected from server
  horizon.onDisconnected().forEach(() => console.log("Disconnected from Horizon Server"))
```

From here, you could take any framework and add these functions to create a realtime chat application
without writing a single line of backend code.

There's also plenty of other functions in the Horizon Client library to meet your needs, including:
[above][above], [below][below], [limit][limit], [replace][replace], and [upsert][upsert].

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
