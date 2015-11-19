/*jshint unused:false */
(function(exports) {

  'use strict';

  const Fusion = require("Fusion");
  const fusion = new Fusion("localhost:8181", {
    secure: true
  });
  const todos = fusion("todos");

  exports.todoStorage = {

    generateUUID: function(){
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
    save: function(newVal, oldVal) {

      // Can't compare oldVal to newVal because of Vue/Javascript limitations. Only
      //  certain mutations to an array are detectable. So save every doc.
      if (Array.isArray(newVal)){
          todos.replace(newVal)
      } else {
          todos.store(newVal);
      }

    },

    update: function(todo){
      console.log(todo);
      todos.replace(todo);
    },

		remove: function(todo){
      if (!Array.isArray(todo)){
          todos.remove(todo);
      } else if (Array.isArray(todo)){
          todos.removeAll(todo)
      }
		},

    changes: function(added, changed, removed) {
      todos.subscribe()
        .on("added", added)
        .on("changed", changed)
        .on("removed", removed)
    }
  };

})(window);
