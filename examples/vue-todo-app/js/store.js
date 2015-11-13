/*jshint unused:false */
(function(exports) {

  'use strict';

  const Fusion = require("Fusion");
  const fusion = new Fusion("localhost:8181", {
    secure: true
  });
  const todos = fusion("todos");

  exports.todoStorage = {

    todos: todos,

    fetchAll: function(app) {
      console.log("FETCHING ALL")
      todos.value().then(function(result) {

        app.todos = app.todos.concat(result);

      }).catch(function(error) {
        console.error(error);
      });
    },
    saveAll: function(newVal, oldVal) {
			console.log("SAVEALL")

			if(!newVal.length){ return; }

			for (var newDoc of newVal){
				for (var oldDoc of oldVal){
          console.log(newDoc)
          console.log(oldDoc)
					if (newDoc.title !== oldDoc.title || newDoc.completed !== oldDoc.completed){
						todos.store(newDoc);
					}
				}
			}
    },

		remove: function(doc){
			todos.remove(doc);
		},

    changes: function(added, changed, removed) {
      todos.subscribe()
        .on("added", added)
        .on("changed", changed)
        .on("removed", removed)
    }
  };

})(window);
