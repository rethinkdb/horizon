# Horizon Client Library

The Horizon client library. Built to interact with the [Horizon Server](/server) websocket API. Provides all the tooling to build a fully-functional and reactive front-end web application.

## Building

Running `npm install` for the first time will build the browser bundle and lib files.

1. `npm install`
2. `npm run dev` (or `npm run build` or `npm run compile`, see below)

### Build Options

Command             | Description
--------------------|----------------------------
npm run dev         | Watch directory for changes, build dist/horizon.js unminified browser bundle
npm run build       | Build dist/horizon.js minified production browser bundle
npm run compile     | Compile src to lib for CommonJS module loaders (such as webpack, browserify)
npm test            | Run tests in node
npm run lint -s     | Lint src
npm run devtest     | Run tests and linting continually

## Running tests

* `npm test` or open `dist/test.html` in your browser after getting setup and while you also have Horizon server with the `--dev` flag running on `localhost`.
* You can spin up a dev server by cloning the horizon repo and running `node serve.js` in `test` directory in repo root. Then tests can be accessed from <http://localhost:8181/test.html>. Source maps work properly when served via http, not from file system. You can test the production version via `NODE_ENV=production node serve.js`. You may want to use `test/setupDev.sh` to set the needed local npm links for development.

## Docs

### Getting Started

While you could build and import this library, you wouldn't have any place to connect to! Once you have the [Horizon Server](/server) running, the Horizon client library is hosted by the server as seen in the getting started example below.

First you need to ensure that you have included the `horizon.js` client library in your HTML.
**Note**: that you'll want to have `http` instead of `https` if you started Horizon Server with `--insecure`. By default Horizon Server hosts the `horizon.js` client library on port 8181.

```html
...
<head>
<script src="//localhost:8181/horizon/horizon.js"></script>
</head>
...
```

Then wherever you want to use Project Horizon you will need to `require` the Horizon client library and then connect to your running instance of Horizon Server.

**Note:** if you started Horizon Server with `--insecure`, you'll need to [disable the secure flag](#Horizon).

```javascript
const Horizon = require("@horizon/client"); // or use global `window.Horizon`
const horizon = Horizon();
```

From here you can start to interact with RethinkDB collections through the Horizon collection. Having `--dev` mode enabled on the Horizon Server creates collections and indexes automatically so you can get your application setup with as little hassle as possible.

```javascript
const chat = horizon("messages");
```

Now, `chat` is a Horizon collection of documents. You can perform a variety of operations on this collection to filter them down to the ones you need. Let's pretend we are building a simple chat application where the messages are displayed in ascending order. Here are some basic functions that would allow you to build such an app.

```javascript

let chats = []

// Retrieve all messages from the server
const retrieveMessages = () => {
  chat.order('datetime')
  // fetch all results as an array, rather than one at a time
  .fetch().toArray()
  // Retrieval successful, update our model
  .forEach(newChats => {
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
    .forEach(result => {
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

### API

* [Horizon](#horizon)
* [Collection](#collection)
* [above](#above-limit-integer--key-value-closed-string-)
* [below](#below-limit-integer--key-value-closed-string-)
* [fetch](#fetch)
* [find](#find---id-any-)
* [findAll](#findall--id-any----id-any--)
* [limit](#limit-num-integer-)
* [order](#order---directionascending-)
* [remove](#remove-id-any--id-any-)
* [removeAll](#removeall--id-any--id-any-----id-any---id-any---)
* [replace](#replace--)
* [store](#store-------)
* [upsert](#upsert------)
* [watch](#watch--rawchanges-false--)

#### Horizon

Object which initializes the connection to a Horizon Server.

If Horizon server has been started with `--insecure` then you will need to connect unsecurely by passing `{secure: false}` as a second parameter.

###### Example

```javascript
const Horizon = require("@horizon/client")
const horizon = Horizon()

const unsecure_horizon = Horizon({ secure: false })
```

#### Collection

Object which represents a collection of documents on which queries can be performed.

###### Example
```javascript
// Setup connection the Horizon server
const Horizon = require("@horizon/client")
const horizon = Horizon()

// Create horizon collection
const messages = horizon('messages')
```

##### above( *limit* *&lt;integer&gt;* || *{key: value}*, *closed* *&lt;string&gt;* )

The `.above` method can be chained onto all methods with the exception of `.find` and `.limit` and restricts the range of results returned.

The first parameter if an integer will limit based on `id` and if an object is provided the limit will be on the key provided and its value.

The second parameter allows only either "closed" or "open" as arguments for inclusive or exclusive behavior for the limit value.

###### Example

```javascript

// {
//  id: 1,
//  text: "Top o' the morning to ya! 🇮🇪",
//  author: "kittybot"
// }, {
//  id: 2,
//  text: "Howdy! 🇺🇸",
//  author: "grey"
// }, {
//  id: 3,
//  text: "Bonjour 🇫🇷",
//  author: "coffeemug"
// }, {
//  id: 4,
//  text: "Gutentag 🇩🇪",
//  author: "deontologician"
// }, {
//  id: 5,
//  text: "G'day 🇦🇺",
//  author: "dalanmiller"
// }

// Returns docs with id 4 and 5
chat.messages.order("id").above(3);

// Returns docs with id 3, 4, and 5
chat.messages.order("id").above(3, "closed");

// Returns the documents with ids 1, 2, 4, and 5 (alphabetical)
chat.messages.order("id").above({author: "d"});
```

##### below( *limit* *&lt;integer&gt;* || *{key: value}*, *closed* *&lt;string&gt;* )

The `.below` method can only be chained onto an `.order(...)` method and limits the range of results returned.

The first parameter if an integer will limit based on `id` and if an object is provided the limit will be on the key provided and its value.

The second parameter allows only either "closed" or "open" as arguments for inclusive or exclusive behavior for the limit value.

###### Example

```javascript

// {
//  id: 1,
//  text: "Top o' the morning to ya! 🇮🇪",
//  author: "kittybot"
// }, {
//  id: 2,
//  text: "Howdy! 🇺🇸",
//  author: "grey"
// }, {
//  id: 3,
//  text: "Bonjour 🇫🇷",
//  author: "coffeemug"
// }, {
//  id: 4,
//  text: "Gutentag 🇩🇪",
//  author: "deontologician"
// }, {
//  id: 5,
//  text: "G'day 🇦🇺",
//  author: "dalanmiller"
// }

// Returns docs with id 1 and 2
chat.messages.order("id").below(3);

// Returns docs with id 1, 2, and 3
chat.messages.order("id").below(3, "closed");

// Returns the document with id 3 (alphabetical)
chat.messages.order("id").below({author: "d"});
```

##### fetch()

Queries for the results of a query currently, without updating results when they change

##### Example

```javascript

// Returns the entire contents of the collection
horizon('chats').fetch().forEach(
  result => console.log('Result:', result),
  err => console.error(err),
  () => console.log('Results fetched, query done!')
)

// Sample output
Result: { id: 1, chat: 'Hey there' }
Result: { id: 2, chat: 'Ho there' }
Results fetched, query done!
```

If you would rather get the results all at once as an array, you can
chain `.toArray()` to the call:

``` js
horizon('chats').fetch().toArray().forEach(
  results => console.log('All results: ', results),
  err => console.error(err),
  () => console.log('Results fetched, query done!')
)

// Sample output
All results: [ { id: 1, chat: 'Hey there' }, { id: 2, chat: 'Ho there' } ]
Results fetched, query done!
```

##### find( *{}* || *id* *&lt;any&gt;* )

Retrieve a single object from the Horizon collection.

###### Example

```javascript
// Using id, both are equivalent
chats.find(1)
chats.find({ id: 1 })

// Using another field
chats.find({ name: "dalan" })
```

##### findAll( *{ id:* *&lt;any&gt; }* [, *{ id:* *&lt;any&gt; }*] )

Retrieve multiple objects from the Horizon collection. Returns `[]` if queried documents do not exist.

###### Example

```javascript
chats.findAll({ id: 1 }, { id: 2 });

chats.findAll({ name: "dalan" }, { id: 3 });
```

##### limit( *num* *&lt;integer&gt;* )

Limit the output of a query to the provided number of documents. If the result of the query prior to `.limit(...)` is fewer than the value passed to `.limit` then the results returned will be limited to that amount.

If using `.limit(...)` it must be the final method in your query.

###### Example

```javascript

chats.limit(5);

chats.findAll({ author: "dalan" }).limit(5);

chats.order("datetime", "descending").limit(5);
```

##### order( *<string>* [, *direction*="ascending"] )

Order the results of the query by the given field string. The second parameter is also a string that determines order direction. Default is ascending ⏫.

###### Example

```javascript
chats.order("id");

// Equal result
chats.order("name");
chats.order("name", "ascending");

chats.order("age", "descending");
```

##### remove( *id* *&lt;any>* || *{id:* *\<any>}* )

Remove a single document from the collection. Takes an `id` representing the `id` of the document to remove or an object that has an `id` key.

###### Example

```javascript

// Equal results
chat.remove(1);
chat.remove({ id: 1 })

```
##### removeAll( [ *id* *&lt;any&gt;* [, *id* *&lt;any&gt;* ]] || [ *{* *id:* *&lt;any&gt;* [, *{* *id:* *&lt;any&gt;* *}* ]] )

Remove multiple documents from the collection via an array of `id` integers or an array of objects that have an `id` key.

###### Example

```javascript

// Equal results
chat.removeAll([1, 2, 3]);
chat.removeAll([{ id: 1 }, { id: 2 }, { id: 3 }]);
```

##### replace( *{}* )

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

##### store( *{}* || [ *{}* [, *{}*] )

The `store` method stores objects or arrays of objects. One can also chain `.forEach` off of `.store` which takes two
functions to handle store succeses and errors.

###### Example 

```js
chat.store({
  id:1,
  text: "Hi 😁"
});

chat.find({ id: 1 }).fetch().forEach((doc) => {
  console.log(doc); // matches stored document above
});

chat.store({ id: 2, text: "G'day!" }).forEach(
  (success) => { console.log("Insert success" + success) }, 
  (error) => { console.log(err) }
);

```

##### upsert( *{}* || *{}* [, *{}*] )

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

##### watch( *{ rawChanges: false }* )

Turns the query into a changefeed query, returning an observable that receives a live-updating view of the results every time they change.

###### Example

This query will get all chats in an array every time a chat is added,
removed or deleted.

```js
horizon('chats').watch().forEach(allChats => {
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
horizon('chats').watch({ rawChanges: true }).forEach(change => {
  console.log('Chats changed:', change)
})

// Sample output
Chat changed: { type: 'state', state: 'synced' }
Chat changed: { type: 'added', new_val: { id: 1, chat: 'Hey there' }, old_val: null }
Chat changed: { type: 'added', new_val: { id: 2, chat: 'Ho there' }, old_val: null }
Chat changed: { type: 'removed', new_val: null, old_val: { id: 1, chat: 'Hey there' } }
```


