/*jshint unused:false */
(function(exports) {

  'use strict';

  const Horizon = require("Horizon");
  const horizon = new Horizon(location.host, {
    secure: location.protocol == 'https:'
  });
  const todos = horizon("vuejs_todos");

  exports.todoStorage = {
    todos: todos,

    save: function(newVal) {
      todos.store(newVal);
    },

    update: function(todo) {
      todos.replace({
        id: todo.id,
        title: todo.title,
        completed: todo.completed,
        datetime: todo.datetime,
      })
    },

    remove: function(todo) {
      todos.remove(todo);
    },

    changes: function() {
      return todos.watch()
    }
  };

})(window);
