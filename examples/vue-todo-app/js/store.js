/*jshint unused:false */
(function (exports) {

	'use strict';

	var f = require("Fusion");
	var Fusion = new f.Fusion("localhost:31420");
	var todos = Fusion("todos");
	var STORAGE_KEY = 'todos-vuejs';

	exports.todoStorage = {

		fetchAll: function() {
			return todos.value();
		},
		saveOne: function (todo) {
			//localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
			todos.update(todo);
		},
		saveAll: function(todos){
			for(todo in todos){
				this.saveOne(todo);
			}
		},
		changes: function(added, updated, deleted){
			todos
				.on("added", added)
				.on("updated", updated)
				.on("deleted", deleted)
		}
	};

})(window);
