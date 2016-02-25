'use strict'

// Testing examples in client/README.md to determine whether or
// not our examples are actually passing tests and need to
// change.

const readmeSuite = (getData) => () => {

  before(() => {
    data = getData()
    const Horizon = require("Horizon");
    const horizon = new Horizon("localhost:8181");
  })

  beforeEach(() => {
    chat = horizon("messages")
  })

  chatInit = [{
    datetime: new Date(),
    message: "Hi"
  }, {
    datetime: new Date(),
    message: "Hello"
  }, {
    datetime: new Date(),
    message: "!"
  }, ]

  it("Chat example", () => {
      let chats = []

      const retrieveMessages = () => {
        chat.order('datetime')
          // fetch all results as an array, rather than one at a time
          .fetch({
            asCursor: false
          })
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

        // Error occurred
        error => console.log(error))
    }

    retrieveMessage(chatIds[0])

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
  })

it(".watch example", () => {
  chat.watch().forEach(chats => {
      // Each time through it will returns all results of your query
      renderChats(allChats)
    },

    // When error occurs on server
    error => console.log(error),
  )
})

it("connection events example", () => {
  // Triggers when client successfully connects to server
  horizon.onConnected().subscribe(() => console.log("Connected to Horizon Server"))

  // Triggers when disconnected from server
  horizon.onDisconnected().subscribe(() => console.log("Disconnected from Horizon Server"))
})

it("API - above", assertCompletes(() => {
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
  chat.messages.order("id").above({
    author: "d"
  });
}))

it("API - below", assertCompletes(() => {
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
  chat.messages.order("id").below({
    author: "d"
  });
}))

it("API - find", assertCompletes(() => {
  chats.find(1)
  chats.find({
    id: 1
  })

  chats.find({
    name: "dalan"
  })
}))

it("API - findAll", assertCompletes(() => {
  chats.findAll({
    id: 1
  }, {
    id: 2
  });

  chats.findAll({
    name: "dalan"
  }, {
    id: 3
  });
}))

it("API - limit", assertCompletes(() => {
  chats.limit(5);

  chats.findAll({
    author: "dalan"
  }).limit(5);

  chats.order("datetime", "descending").limit(5);
}))

it("API - order", assertCompletes(() => {
  chats.order("id");

  chats.order("name");
  chats.order("name", "ascending");

  chats.order("age", "descending");
}))

it("API - remove", assertCompletes(() => {
  chat.remove(1);
  chat.remove({
    id: 1
  })
}))

it("API - removeAll", assertCompletes(() => {
  chat.removeAll([1, 2, 3]);
  chat.removeAll([{
    id: 1
  }, {
    id: 2
  }, {
    id: 3
  }]);
}))

it("API - replace", () => {

  // Will result in error
  assertErrors(() => {
    chat.replace({
      id: 1,
      text: "Oh, hello"
    });
  })

  assertCompletes(() => {
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
  })


})

it("API - upsert", assertCompletes(() => {
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

  chat.find(1).value().then((message) => {

    // Returns "Howdy 😅"
    console.log(message.text);
  });
}))

it("API - watch", assertCompletes(() => {
  horizon('chats').watch().forEach(allChats => {
    console.log('Chats: ', allChats)
  })

  horizon('chats').watch({
    rawChanges: true
  }).forEach(change => {
    console.log('Chats changed:', change)
  })
}))

it("API - watch", assertCompletes(() => {
  // Returns the entire contents of the collection
  horizon('chats').fetch().subscribe(
    result => console.log('Result:', result),
    err => console.error(err),
    () => console.log('Results fetched, query done!')
  )

  horizon('chats').fetch({
    asCursor: false
  }).subscribe(
    results => console.log('Results: ', result),
    err => console.error(err),
    () => console.log('Results fetched, query done!')
  )
}))
}
