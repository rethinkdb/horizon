# Fusion Client Library

The Fusion client library. Built to interact with the [Fusion Server](/server) websocket API. Provides all the tooling to build a fully-functional and reactive front-end web application.

## Building

You first need to install dependencies and then you may build the client library using the build script.

1. `npm install`
2. `./build.js [--watch]`

### Build Options

Flag                | Description
--------------------|----------------------------
-w, --watch         | Watch directory for changes
-U, --no-uglify     | Don't uglify output
-S, --no-sourcemaps | Don't output sourcemaps
-g, --expose-global | Expose Fusion module as a global


## Running tests

* Open `test/test.html` in your browser after getting setup and while you also have Fusion server with the `--dev` flag running on `localhost`.

## Docs

### Getting Started

While you could build and import this library, you wouldn't have any place to connect to! Once you have the [Fusion Server](/server) running, the Fusion client library is hosted by the server as seen in the getting started example below.

First you need to ensure that you have included the `fusion.js` client library in your HTML.
**Note**: that you'll want to have `http` instead of `https` if you started Fusion Server with `--insecure`. By default Fusion Server hosts the `fusion.js` client library on it's host on port 8181.

```html
...
<head>
<script src="//localhost:8181/fusion.js"></script>
</head>
...
```

Then wherever you want to use Project Fusion you will need to `require` the Fusion client library and then connect to your running instance of Fusion Server.

**Note:** if you started Fusion Server with `--insecure`, you'll need to [add the insecure flag](#fusion).

```javascript
const Fusion = require("Fusion");
const fusion = new Fusion("localhost:8181");
```

From here you can start to interact with RethinkDB collections through the Fusion collection. Having `--dev` mode enabled on the Fusion Server creates collections and indexes automatically so you can get your application setup with as little hassle as possible.

```javascript
const chat = fusion("messages");
```

Now, `chat` is a Fusion collection of documents. You can perform a variety of operations on this collection to filter them down to the ones you need. Let's pretend we are building a simple chat application where the messages are displayed in ascending order. Here are some basic functions that would allow you to build such an app.

```javascript

let chats = []

// Retrieve all messages from the server
const retrieveMessages = () => {
  chat.order('datetime')
  // fetch all results as an array, rather than one at a time
  .fetch({ asCursor: false })
  // Retrieval successful, update our model
  .subscribe(newChats => {
    chats = chats.concat(newChats)
  },
  // Error handler
  error => console.log(error),
  // onCompleted handler
  () => console.log('All results received!')
  )
}

// Retrieve an single item by id
const retrieveMessage = id => {
  chat.find(id).fetch()
    // Retrieval successful
    .subscribe(result => {
      chats.push(result);
    },
    // Error occurred
    error => console.log(error))
}

// Store new item
const storeMessage = (message) => {
   chat.store(message)
    .forEach( // forEach is an alias of .subscribe
      // Returns id of saved objects
      result => console.log(result),
      // Returns server error message
      error => console.log(error)
    )
}

// Replace item that has equal `id` field
//  or insert if it doesn't exist.
const updateMessage = message => {
  chat.replace(message)
}

// Remove item from collection
const deleteMessage = message => {
  chat.remove(message)
}
```

And lastly, the `.watch` method exposes all the changefeeds awesomeness you could want from RethinkDB. Using just `chat.watch()`, and the updated results will be pushed to you any time they change on the server. You can also `.watch` changes on a query or a single document.


```javascript

chats.watch().forEach(chats => {
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
  fusion.onConnected().subscribe(() => console.log("Connected to Fusion Server"))

  // Triggers when disconnected from server
  fusion.onDisconnected().subscribe(() => console.log("Disconnected from Fusion Server"))
```

### API

#### Fusion

Object which initializes the connection to a Fusion Server.

If Fusion server has been started with `--unsecure` then you will need to connect unsecurely by passing `{secure: false}` as a second parameter.

###### Example

```javascript
const Fusion = require("fusion")
const fusion = Fusion("localhost:8181")

const unsecure_fusion = Fusion('localhost:8181', { unsecure: true })
```

#### Collection

Object which represents a collection of documents on which queries can be performed.

###### Example
```javascript
// Setup connection the Fusion server
const Fusion = require("fusion")
const fusion = Fusion("localhost:8181")

// Create fusion collection
const messages = fusion('messages')
```

##### above(*limit integer* || *{key: value}*, *closed string*)

The `.above` method can be chained onto all methods with the exception of `.find` and `.limit` and restricts the range of results returned.

The first parameter if an integer will limit based on `id` and if an object is provided the limit will be on the key provided and its value.

The second parameter allows only either "closed" or "open" as arguments for inclusive or exclusive behavior for the limit value.

###### Example

```javascript

chat.store([{
  id: 1,
  text: "Top o' the morning to ya! 🇮🇪",
  author: "kittybot"
}, {
  id: 2,
  text: "Howdy! 🇺🇸",
  author: "grey"
}, {
  id: 3,
  text: "Bonjour 🇫🇷",
  author: "coffeemug"
}, {
  id: 4,
  text: "Gutentag 🇩🇪",
  author: "deontologician"
}, {
  id: 5,
  text: "G'day 🇦🇺",
  author: "dalanmiller"
}]);

// Returns docs with id 4 and 5
chat.messages.order("id").above(3);

// Returns docs with id 3, 4, and 5
chat.messages.order("id").above(3, "closed");

// Returns the documents with ids 1, 2, 4, and 5 (alphabetical)
chat.messages.order("id").above({author: "d"});
```

##### below([limit integer || {key: value}], closed string)

The `.below` method can only be chained onto an `.order(...)` method and limits the range of results returned.

The first parameter if an integer will limit based on `id` and if an object is provided the limit will be on the key provided and its value.

The second parameter allows only either "closed" or "open" as arguments for inclusive or exclusive behavior for the limit value.

###### Example

```javascript

chat.store([{
  id: 1,
  text: "Top o' the morning to ya! 🇮🇪",
  author: "kittybot"
}, {
  id: 2,
  text: "Howdy! 🇺🇸",
  author: "grey"
}, {
  id: 3,
  text: "Bonjour 🇫🇷",
  author: "coffeemug"
}, {
  id: 4,
  text: "Gutentag 🇩🇪",
  author: "deontologician"
}, {
  id: 5,
  text: "G'day 🇦🇺",
  author: "dalanmiller"
}]);

// Returns docs with id 1 and 2
chat.messages.order("id").below(3);

// Returns docs with id 1, 2, and 3
chat.messages.order("id").below(3, "closed");

// Returns the document with id 3 (alphabetical)
chat.messages.order("id").below({author: "d"});
```

##### find(*object*)

Retrieve a single object from the Fusion collection.

###### Example

```javascript
// Using id, both are equivalent
chats.find(1)
chats.find({id:1})

// Using another field
chats.find({name: "dalan"})
```

##### findAll(*object* [, *object*])

Retrieve multiple objects from the Fusion collection. Returns `[]` if queried documents do not exist.

###### Example

```javascript
chats.findAll({id: 1}, {id: 2});

chats.findAll({name: "dalan"}, {id: 3});
```

##### limit(*num integer*)

Limit the output of a query to the provided number of documents. If the result of the query prior to `.limit(...)` is fewer than the value passed to `.limit` then the results returned will be limited to that amount.

If using `.limit(...)` it must be the final method in your query.

##### Example

```javascript

chats.limit(5);

chats.findAll({author: "dalan"}).limit(5);

chats.order("datetime", "descending").limit(5);
```

##### order(*string* [, *direction*="ascending"])

Order the results of the query by the given field string. The second parameter is also a string that determines order direction. Default is ascending ⏫.

###### Example

```javascript
chats.order("id");

// Equal result
chats.order("name");
chats.order("name", "ascending");

chats.order("age", "descending");
```

##### remove(*id string* || *{id: integer}*)

Remove a single document from the collection. Takes an `id` representing the `id` of the document to remove or an object that has an `id` key.

###### Example

```javascript

// Equal results
chat.remove(1);
chat.remove({id:1})

```
##### removeAll(*[id integer [, id integer]]* || *{id: integer [,{id: integer}]}*)

Remove multiple documents from the collection via an array of `id` integers or an array of objects that have an `id` key.

###### Example

```javascript

// Equal results
chat.removeAll([1, 2, 3]);
chat.removeAll([{id: 1}, {id: 2}, {id: 3}]);
```

##### replace(*{}*)

The `replace` command replaces documents already in the database. An error will occur if the document does not exist.

###### Example

```javascript

// Will result in error
chat.replace({
  id: 1,
  text: "Oh, hello"
});

// Store a document
chat.store({
  id: 1,
  text: "Howdy!"
});

// Replace will be successful
chat.replace({
  id: 1,
  text: "Oh, hello!"
});
```

##### upsert(*{}* || *{} [,{}]*)

The `upsert` method allows storing multiple documents in one call. If any of them exist, the existing version of the document will be updated with the new version supplied to the method.

###### Example

```javascript

chat.store({
  id:1,
  text: "Hi 😁"
});

chat.upsert([{
  id: 1,
  text: "Howdy 😅"
}, {
  id: 2,
  text: "Hello there!"
}, {
  id: 3,
  text: "How have you been?"
}]);

chat.find(1).value().then((message) => {

  // Returns "Howdy 😅"
  console.log(message.text);
});

```

##### watch({ rawChanges: false })

Turns the query into a changefeed query, returning an observable that receives a live-updating view of the results every time they change.

If you pass `rawChanges: true`, instead of

###### Example

This query will get all chats in an array every time a chat is added,
removed or deleted.

```js
fusion('chats').watch().forEach(allChats => {
  console.log('Chats: ', allChats)
})

// Sample output
Chats: []
Chats: [{ id: 1, chat: 'Hey there' }]
Chats: [{ id: 1, chat: 'Hey there' }, {id: 2, chat: 'Ho there' }]
Chats: [{ id: 2, chat: 'Ho there' }]
```

Alternately, you can provide the `rawChanges: true` option to receive change documents from the server directly, instead of having the client maintain the array of results for you.

``` js
fusion('chats').watch({ rawChanges: true }).forEach(change => {
  console.log('Chats changed:', change)
})

// Sample output
Chat changed: { type: 'state', state: 'synced' }
Chat changed: { type: 'added', new_val: { id: 1, chat: 'Hey there' }, old_val: null }
Chat changed: { type: 'added', new_val: { id: 2, chat: 'Ho there' }, old_val: null }
Chat changed: { type: 'removed', new_val: null, old_val: { id: 1, chat: 'Hey there' } }
```

##### fetch({ asCursor: true })

Queries for the results of a query currently, without updating results when they change

##### Example

```javascript

// Returns the entire contents of the collection
fusion('chats').fetch().subscribe(
  result => console.log('Result:', result),
  err => console.error(err),
  () => console.log('Results fetched, query done!')
)

// Sample output
Result: { id: 1, chat: 'Hey there' }
Result: { id: 2, chat: 'Ho there' }
Results fetched, query done!
```

If you pass `asCursor: false`, you will get the entire result set at once as an array.

``` js
fusion('chats').fetch({ asCursor: false }).subscribe(
  results => console.log('Results: ', result),
  err => console.error(err),
  () => console.log('Results fetched, query done!')
)

// Sample output
Results: [ { id: 1, chat: 'Hey there' }, { id: 2, chat: 'Ho there' } ]
Results fetched, query done!
```

Doing `.fetch({ asCursor: false })` is basically equivalent to `.fetch().toArray()`, but it can be less verbose in cases where you want a `fetch()` query to work similarly to a `.watch()` query.
