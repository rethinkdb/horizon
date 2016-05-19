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
[Check out our Getting Started guide.](/GETTING-STARTED.md)

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

```js
const Horizon = require("@horizon/client")
const horizon = Horizon()

const unsecure_horizon = Horizon({ secure: false })
```

#### Collection

Object which represents a collection of documents on which queries can be performed.

###### Example
```js
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

```js

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
chat.messages.order("id").above(3).fetch().subscribe(doc => console.log(doc));

// Returns docs with id 3, 4, and 5
chat.messages.order("id").above(3, "closed").fetch().subscribe(doc => console.log(doc));

// Returns the documents with ids 1, 2, 4, and 5 (alphabetical)
chat.messages.order("id").above({author: "d"}).fetch().subscribe(doc => console.log(doc));
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
chat.messages.order("id").below(3).fetch().subscribe(doc => console.log(doc));

// Returns docs with id 1, 2, and 3
chat.messages.order("id").below(3, "closed").fetch().subscribe(doc => console.log(doc));

// Returns the document with id 3 (alphabetical)
chat.messages.order("id").below({author: "d"}).fetch().subscribe(doc => console.log(doc));
```

##### fetch()

Queries for the results of a query currently, without updating results when they change. This is used to complete and send
the query request.

##### Example

```js

// Returns the entire contents of the collection as an array
horizon('chats').fetch().subscribe(
  results => console.log('Results:', results),
  err => console.error(err),
  () => console.log('Results fetched, query done!')
)

// Sample output
// Results: [{ id: 1, chat: 'Hey there' }, { id: 2, chat: 'Ho there' }]
// Results fetched, query done!
```

##### find( *{}* || *id* *&lt;any&gt;* )

Retrieve a single object from the Horizon collection.

###### Example

```js
// Using id, both are equivalent
chats.find(1).fetch().subscribe(doc => console.log(doc));
chats.find({ id: 1 }).fetch().subscribe(doc => console.log(doc));

// Using another field
chats.find({ name: "dalan" }).fetch().subscribe(doc => console.log(doc));
```

##### findAll( *{ id:* *&lt;any&gt; }* [, *{ id:* *&lt;any&gt; }*] )

Retrieve multiple objects from the Horizon collection. Returns `[]` if queried documents do not exist.

###### Example

```js
chats.findAll({ id: 1 }, { id: 2 }).fetch().subscribe(doc => console.log(doc));

chats.findAll({ name: "dalan" }, { id: 3 }).fetch().subscribe(doc => console.log(doc));
```

##### subscribe( *readResult[s]* *&lt;function&gt;*, *error* *&lt;function&gt;*, *completed* *&lt;function&gt;* || *writeResult[s] *&lt;function&gt;*, *error* *&lt;function&gt;* || *changefeedHandler* *&lt;function&gt;*, *error* *&lt;function&gt;*)

Means of providing handlers to a query on a Horizon collection.

###### Example

When `.subscribe` is chained off of a read operation it accepts three functions as parameters. A results handler, a error handler, and a result completion handler.

```js
// Documents are returned as an array
chats.fetch().subscribe(
  (result) => { console.log("All documents =>" + result ) },
  (error) => { console.log ("Danger Will Robinson 🤖! || " + error ) },
  () => { console.log("Read is now complete" ) }
);
```

When `.subscribe` is chained off of a write operation it accepts two functions, one which handles successful writes and handles the returned `id` of the document from the server as well as an error handler.

```js
chats.store([
    { text: "So long, and thanks for all the 🐟!" },
    { id: 2, text: "Don't forget your towel!" }
  ]).subscribe(
    (id) => { console.log("A saved document id =>" + id ) },
    (error) => { console.log ("An error has occurred || " + error ) },
  );

// Output:
// f8dd67dc-2301-487a-85ab-c4b573acad2d
// 2 (because `id` was provided)
```

When `.subscribe` is chained off of a changefeed it accepts two functions, one which handles the changefeed results as well as an error handler.

```js
chats.watch().subscribe(
  (chats) => { console.log("The entire chats collection triggered by changes =>" + chats ) },
  (error) => { console.log ("An error has occurred || " + error ) },
);
```

##### limit( *num* *&lt;integer&gt;* )

Limit the output of a query to the provided number of documents. If the result of the query prior to `.limit(...)` is fewer than the value passed to `.limit` then the results returned will be limited to that amount.

If using `.limit(...)` it must be the final method in your query.

###### Example

```js

chats.limit(5).fetch().subscribe(doc => console.log(doc));

chats.findAll({ author: "dalan" }).limit(5).fetch().subscribe(doc => console.log(doc));

chats.order("datetime", "descending").limit(5).fetch().subscribe(doc => console.log(doc));
```

##### order( *<string>* [, *direction*="ascending"] )

Order the results of the query by the given field string. The second parameter is also a string that determines order direction. Default is ascending ⏫.

###### Example

```js
chats.order("id").fetch().subscribe(doc => console.log(doc));

// Equal result
chats.order("name").fetch().subscribe(doc => console.log(doc));
chats.order("name", "ascending").fetch().subscribe(doc => console.log(doc));

chats.order("age", "descending").fetch().subscribe(doc => console.log(doc));
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

```js

// Equal results
chat.removeAll([1, 2, 3]);
chat.removeAll([{ id: 1 }, { id: 2 }, { id: 3 }]);
```

##### replace( *{}* )

The `replace` command replaces documents already in the database. An error will occur if the document does not exist.

###### Example

```js

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

The `store` method stores objects or arrays of objects. One can also chain `.subscribe` off of `.store` which takes two
functions to handle store succeses and errors.

###### Example

```js
chat.store({
  id:1,
  text: "Hi 😁"
});

chat.find({ id: 1 }).fetch().subscribe((doc) => {
  console.log(doc); // matches stored document above
});

chat.store({ id: 2, text: "G'day!" }).subscribe(
  (id) => { console.log("saved doc id: " + id) },
  (error) => { console.log(err) }
);

```

##### upsert( *{}* || [ *{}* [, *{}* ]] )

The `upsert` method allows storing a single or multiple documents in a single call. If any of them exist, the existing version of the document will be updated with the new version supplied to the method. Replacements are determined by already existing documents with an equal `id`.

###### Example

```javascript

chat.store({
  id: 1,
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

chat.find(1).fetch().subscribe((doc) => {
  // Returns "Howdy 😅"
  console.log(doc.text);
});

```

##### watch( *{ rawChanges: false }* )
Turns the query into a changefeed query, returning an observable that receives a live-updating view of the results every time they change.

###### Example

This query will get all chats in an array every time a chat is added,
removed or deleted.

```js
horizon('chats').watch().subscribe(allChats => {
  console.log('Chats: ', allChats)
})

// Sample output
// Chats: []
// Chats: [{ id: 1, chat: 'Hey there' }]
// Chats: [{ id: 1, chat: 'Hey there' }, {id: 2, chat: 'Ho there' }]
// Chats: [{ id: 2, chat: 'Ho there' }]
```

Alternately, you can provide the `rawChanges: true` option to receive change documents from the server directly, instead of having the client maintain the array of results for you.

```js
horizon('chats').watch({ rawChanges: true }).subscribe(change => {
  console.log('Chats changed:', change)
})

// Sample output
// Chat changed: { type: 'state', state: 'synced' }
// Chat changed: { type: 'added', new_val: { id: 1, chat: 'Hey there' }, old_val: null }
// Chat changed: { type: 'added', new_val: { id: 2, chat: 'Ho there' }, old_val: null }
// Chat changed: { type: 'removed', new_val: null, old_val: { id: 1, chat: 'Hey there' } }
```

## Authenticating

There are three types of authentication types that Horizon recognizes.

### Unauthenticated

The first auth type is unauthenticated. One [JWT](https://jwt.io/) is shared by all unauthenticated users. To create a connection using the 'unauthenticated' method do:

``` js
const horizon = Horizon({ authType: 'unauthenticated' });
```

This is the default authentication method and provides no means to separate user permissions or data in the Horizon application.

### Anonymous

The second auth type is anonymous. If anonymous authentication is enabled in the config, any user requesting anonymous authentication will be given a new JWT, with no other confirmation necessary. The server will create a user entry in the users table for this JWT, with no other way to authenticate as this user than by passing the JWT back. (This is done under the hood with the jwt being stored in localStorage and passed back on subsequent requests automatically).

``` js
const horizon = Horizon({ authType: 'anonymous' });
```

This type of authentication is useful when you need to differentiate users but don't want to use a popular 3rd party to authenticate them. This is essentially the means of "Creating an account" or "Signing up" for people who use your website.

### Token

This is the only method of authentication that verifies a user's identity with a third party. To authenticate, first pick an OAuth identity provider. For example, to use Twitter for authentication, you might do something like:

``` js
const horizon = Horizon({ authType: 'token' });
if (!horizon.hasAuthToken()) {
  horizon.authEndpoint('twitter').toPromise()
    .then((endpoint) => {
      window.location.pathname = endpoint;
    })
} else {
  // We have a token already, do authenticated horizon stuff here...
}
```
After logging in with Twitter, the user will be redirected back to the app, where the Horizon client will grab the JWT from the redirected url, which will be used on subsequent connections where `authType = 'token'`. If the token is lost (because of a browser wipe, or changing computers etc), the user can be recovered by re-authenticating with Twitter.

This is type of authentication is useful for quickly getting your application running with information relevant to your application provided by a third party. Users don't need to create yet another user acount for your application and can reuse the ones they already have.

### Clearing tokens

Sometimes you may wish to delete all authentication tokens from localStorage. You can do that with:

``` js
// Note the 'H'
Horizon.clearAuthTokens()
```
