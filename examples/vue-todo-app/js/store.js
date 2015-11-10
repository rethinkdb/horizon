/*jshint unused:false */
(function(exports) {

  'use strict';

  const Fusion = require("Fusion");
  const fusion = new Fusion("localhost:8181", {
    secure: true
  });
  const todos = fusion("todos");
  var STORAGE_KEY = 'todos-vuejs';

  exports.todoStorage = {

    todos: todos,

    fetchAll: function(app) {
      console.log("FETCHING ALL")
      todos.value().then(function(result) {

        //Because value() on a collection is currently broken
        result = result.map((item) => {
          return item[0];
        });

        app.todos = result;

      }).catch(function(error) {
        console.error(error);
      });
    },
    saveAll: function(newVal, oldVal) {
			console.log("SAVEALL")

			console.log(newVal.length);
			console.log(oldVal.length);

			const newIds = newVal.map(function(doc){return doc.id;});
			console.log(newIds);

			// Check if any of the todos in the old list are not in the computed
			//  list of ids and call .remove
			for (var doc of oldVal){
				console.log(doc);
				if (newIds.indexOf(doc.id) === -1) {
					todos.remove(doc);
				} else {
					todos.store(doc, "replace");
				}
			}
    },
		remove: function(doc){
			todos.remove(doc);
		},
    changes: function(added, updated, deleted) {
      todos.subscribe()
        .on("added", added)
        .on("updated", updated)
        .on("deleted", deleted)
    }
  };

})(window);
