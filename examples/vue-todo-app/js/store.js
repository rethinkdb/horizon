/*jshint unused:false */
(function(exports) {

  'use strict';

  const Fusion = require("Fusion");
  const fusion = new Fusion("localhost:8181/fusion", {
    secure: true
  });
  const todos = fusion("vuejs_todos");

  exports.todoStorage = {
    todos: todos,

      generateUUID: function() {
      var x = Math.floor(Math.random() * 100000000000);
      return Math.floor(Math.random() * x).toString(36) +
        Math.abs(Math.floor(Math.random() * x) ^ Date.now()).toString(36);
    },

    fetchAll: function(app) {
      todos.value().then(function(result) {

        app.todos = app.todos.concat(result);

      }).catch(function(error) {
        console.error(error);
      });
    },
    save: function(newVal) {
      console.log("SENDING STORE");
      console.log(newVal)
      todos.store(newVal);

    },

    update: function(todo) {
      console.log("SENDING UPDATE");
      console.log(todo);
      todos.replace({
        id: todo.id,
        title: todo.title,
        completed: todo.completed,
        datetime: todo.datetime
        // datetime: todo.datetime
      })
        .then(function(res){console.log(res);})
        .catch(function(res){console.log(res);});
    },

    remove: function(todo) {
      console.log("SENDING DELETE")
      todos.remove(todo);
    },

    changes: function(added, changed, removed) {
      todos.subscribe({
        onAdded: added,
        onChanged: changed,
        onRemoved: removed,
        onConnected: function() {console.log("CONNECTED TO SERVER");},
        onDisconnected: function() {console.log("DISCONNECTED FROM SERVER");},
        onError: function(err) {console.log(err);}
      });
    }
  };

})(window);
