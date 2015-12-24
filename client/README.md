# Fusion Client Library

## Building

1. `npm install` && `npm install -g gulp`
2. `gulp`

## Running  tests

You have two options:

* `mocha-phantomjs --ssl-protocol=any --ignore-ssl-errors=true test/test.html`

OR

* Open `test/test.html` in your browser

## Docs

### Getting Started

First you need to ensure that you have grabbing the `fusion.js` client library.

Note: that you'll want to have `http` instead of `https` if you started Fusion Server with `--unsecure`. By default Fusion Server hosts the `fusion.js` client library on it's host on port 8181.

```javascript
<script src="https://localhost:8181/fusion.js"></script>
```

Then wherever you want to use Project Fusion you will need to `require` the Fusion client library and then connect to your running instance of Fusion Server.

Note: if you started Fusion Server with `--unsecure`, you'll need to follow the commented out example.

```javascript
const Fusion = require("Fusion");
const fusion = new Fusion("localhost:8181");

// const fusion = new Fusion("localhost:8181",
//  {secure: false}
// );
```

From here you can start to interact with RethinkDB collections through the Fusion Client collection object.  

Note: If you have `--dev` mode enabled on the Fusion Server, you do not have to worry about either collection creation or index creation.

```javascript
const chat = fusion("messages");
```

Now, `chat` is a Fusion collection and you can interact with it with a subset of the ReQL commands you love from RethinkDB.

All the following methods return a Promise that you can chain `.then(...)` and `.catch(...)` to supply functions to listen for either success or error results from the server.

```javascript

chats = [];

// Retrieve all messages from the server
retrieveMessages = () => {
  chat.value()
  // Retrieval successful, update our model
  .then((res) => {
    chats.concat(res);
  })
  // Error occurred
  .catch((err) => {
    console.log(err);
  });
}

// Retrieve and single item by id
retrieveMessage = (id) => {
  chat.find(id).value()
    // Retrieval successful
    .then((res) => {
      chats.push(res);
    })
    // Error occurred
    .catch((err) => {
      console.log(err);
    });
}

// Store new item
storeMessage = (message) => {
   chat.store(message)
    // Returns id of saved objects
    .then((result) => console.log(result))
    // Returns server error message
    .catch((error) => console.log(error));
}

// Replace item that has equal `id` field
//  or insert if it doesn't exist.
updateMessage = (message) => {
  chat.replace(message);
}

// Remove item from collection
deleteMessage = (message) =>{
  chat.remove(message);
}
```

And lastly, the `.subscribe(...)` method exposes all the changefeeds awesomeness you could want from RethinkDB.

```javascript
chats = [];

chat.subscribe({
  // Initially returns all results from query
  onAdded: (newMessage) => {
    chats.push(newMessage);
  },

  // Triggers on document modifications, receive old version and new version of document
  onChanged: (newMessage, oldMessage) => {  
    chats = chats.map((message) => {
      if (message.id === newMessage.id){
        return newMessage;
      } else {
        return message;
      }
    });
  },

  // Triggers when item is deleted
  onRemoved: (deletedMessage) => {
    chats = chats.map((message) => {
      if (message.id !== deletedMessage.id){
          return message
      }
    });  
  },

  // When error occurs on server
  onError: (error) => console.log(error),

  // Triggers when client successfully connects to server
  onConnected: () => console.log("Connected to Fusion Server"),

  // Triggers when disconnected from server
  onDisconnected: () => console.log("Disconnected from Fusion Server")
})
```

### API

#### Fusion

#### Collection

##### above(*limit integer* || *{key: value}*, *closed string*)

The `.above` method can only be chained onto an `.order(...)` method and limits the range of results returned.

The first parameter if an integer will limit based on `id` and if an object is provided the limit will be on the key provided and its value.

The second parameter allows only either "closed" or "open" as arguments for inclusive or exclusive behavior for the limit value.

###### Example

```javascript

chat.store([{
  id: 1,
  text: "Hello",
  author: "kittybot"
}, {
  id: 2,
  text: "Howdy!",
  author: "grey"
}, {
  id: 3,
  text: "Bonjour",
  author: "coffeemug"
}, {
  id: 4,
  text: "Gutentag",
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

##### below()

The `.below` method can only be chained onto an `.order(...)` method and limits the range of results returned.

The first parameter if an integer will limit based on `id` and if an object is provided the limit will be on the key provided and its value.

The second parameter allows only either "closed" or "open" as arguments for inclusive or exclusive behavior for the limit value.

###### Example

```javascript

chat.store([{
  id: 1,
  text: "Hello",
  author: "kittybot"
}, {
  id: 2,
  text: "Howdy!",
  author: "grey"
}, {
  id: 3,
  text: "Bonjour",
  author: "coffeemug"
}, {
  id: 4,
  text: "Gutentag",
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
// Using id
chats.find({id:1})

// Using another field
chats.find({name: "dalan"})
```

##### findAll(*object* [, *object*])

Retrieve multiple objects from the Fusion collection. Returns `[]` if queried documents do not exist.

###### Example

```javascript
chats.findAll({id:1, id:2});

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

Order the current query by the field indicated by the provided string. The second parameter is also a string that determines order direction. Default is ascending.

###### Example

```javascript
chats.order("id");

// Equal result
chats.order("name");
chats.order("name", "ascending");

chats.order("age", "descending");
```

##### remove(*id string* || *{id: integer}*)

Remove a single document from the collection an `id` representing the id of the document to remove or an object that has an `id` key.

###### Example

```javascript

// Equal results
chat.remove(1);
chat.remove({id:1})

```
##### removeAll(*[id integer [, id integer]]* || *[{id: integer [,{id: integer}]}]*)

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

##### upsert(*{}* || *[{} [,{}]]*)

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

##### subscribe([*{callback map}*])

Subscription method which returns a subscription object where one can define functions for the appropriate callbacks.

###### Example

```javascript
chat.subscribe()

chat.onAdded = (newMessage) => {
  console.log(newMessage);
}

// OR

chat.subscribe({
  onAdded: (newMessage) => {},
  onChanged: (newMessage, oldMessage) => {},
  onRemoved: (deletedMessage) =>  {},
  onError: (error) => {},
  onConnected: () => {},
  onDisconnected: () => {}
});

```

##### value()

Finishes a query and results in a Promise.

##### Example

```javascript

// Returns the entire contents of the collection
chat.value().then((result) => {
  // Array of all documents in the collection
  console.log(result)
})

```
