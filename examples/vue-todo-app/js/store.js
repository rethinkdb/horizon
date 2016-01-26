/*jshint unused:false */
(function(exports) {

  'use strict';

  const Fusion = require("Fusion");
  const fusion = new Fusion(location.host, {
    secure: location.protocol == 'https:'
  });
  const todos = fusion("vuejs_todos");

  exports.todoStorage = {
    todos: todos,

      generateUUID: function() {
      const x = Math.floor(Math.random() * 100000000000);
      return Math.floor(Math.random() * x).toString(36) +
        Math.abs(Math.floor(Math.random() * x) ^ Date.now()).toString(36);
    },

    save: function(newVal) {
      todos.store(newVal);
    },

    update: function(todo) {
      todos.replace({
        id: todo.id,
        title: todo.title,
        completed: todo.completed,
        datetime: todo.datetime
      })
    },

    remove: function(todo) {
      todos.remove(todo);
    },

    changes: function(added, changed, removed) {
      todos.subscribe({
        onAdded: added,
        onChanged: changed,
        onRemoved: removed,
        onSynced: function() {console.log("INITIAL SYNC COMPLETE")},
        onConnected: function() {console.log("CONNECTED TO SERVER");},
        onDisconnected: function() {console.log("DISCONNECTED FROM SERVER");},
        onError: function(err) {console.log(err);}
      });
    }
  };

})(window);
