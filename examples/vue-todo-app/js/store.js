/*jshint unused:false */
(function(exports) {

  'use strict';

  const horizon = Horizon();
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
