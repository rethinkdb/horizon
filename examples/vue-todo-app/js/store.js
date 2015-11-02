/*jshint unused:false */
var f = require("Fusion");
var Fusion = new f.Fusion("ws://websocket");

(function (exports) {

	'use strict';

	var fusion = new Fusion("localhost:8090");
	var todos = fusion.collection("todos");
	var STORAGE_KEY = 'todos-vuejs';

	exports.todoStorage = {

		fetchAll: function() {

		},
		fetchOne: function (id) {
			//return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
			return JSON.parse(todos.findOne(STORAGE_KEY) || "[]");
		},
		saveOne: function (todo) {
			//localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
			todos.findOne(STORAGE_KEY).update(STORAGE_KEY);
		}
		saveAll: function(todos){
			for(todo in todos){
				this.saveOne(todo);
			}
		}
	};

})(window);
