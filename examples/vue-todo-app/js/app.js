/*global Vue, todoStorage */

(function (exports) {

	'use strict';

	var filters = {
		all: function (todos) {
			return todos;
		},
		active: function (todos) {
			return todos.filter(function (todo) {
				return !todo.completed;
			});
		},
		completed: function (todos) {
			return todos.filter(function (todo) {
				return todo.completed;
			});
		}
	};

	Vue.config.debug = true
	exports.app = new Vue({

		// the root element that will be compiled
		el: '.todoapp',

		// app initial state
		data: {
			todos: [],
			newTodo: '',
			tempTodo: {title: "", completed:false},
			editedTodo: null,
			visibility: 'all'
		},

		// watch todos change for localStorage persistence
		watch: {
			todos: {
				deep: true,
				handler: todoStorage.saveAll,
			},
		},

		// computed properties
		//  http://vuejs.org/guide/computed.html
		computed: {
			filteredTodos: function () {
				return filters[this.visibility](this.todos);
			},
			remaining: function () {
				return filters.active(this.todos).length;
			},
			allDone: {
				get: function () {
					return this.remaining === 0;
				},
				set: function (value) {
					this.todos.forEach(function (todo) {
						todo.completed = value;
					});
				}
			},
		},

		// methods that implement data logic.
		//  note there's no DOM manipulation here at all.
		methods: {

			uuid: function() {
  			var x = Math.floor(Math.random() * 100000000000);
  			return Math.floor(Math.random() * x).toString(36) +
        	Math.abs(Math.floor(Math.random() * x) ^ Date.now()).toString(36);
			},

			addTodo: function () {
				const value = this.newTodo && this.newTodo.trim();
				if (!value) {
					return;
				}
				this.todos.push({
					title: value,
					id: this.uuid(),
					completed: false,
					datetime: new Date(),
				});
				this.newTodo = '';
			},

			removeTodo: function (todo){
				this.todos.$remove(todo);
				todoStorage.remove(todo);
			},

			editTodo: function (todo) {
				this.beforeEditCache = todo.title;
				this.editedTodo = todo;
			},

			doneEdit: function (todo) {
				if (!this.editedTodo) {
					return;
				}
				this.editedTodo = null;
				todo.title = todo.title.trim();
				if (!todo.title) {
					this.removeTodo(todo);
				}
			},

			cancelEdit: function (todo) {
				this.editedTodo = null;
				todo.title = this.beforeEditCache;
			},

			removeCompleted: function () {
				this.todos = filters.active(this.todos);
			},

			addedChanges: function (doc) {
				this.todos.push(doc);
			},

			updatedChanges: function (doc) {
				console.log("UPDATING");
				var i = 0;
				for(var todo of this.todos){
					if (todo.id === doc.id && todo.title !== doc.title) {
						this.todos.$set(i, doc);
						return;
					}
					i++;
				}
			},

			deletedChanges: function (doc) {
				console.log(doc);
				for(var todo of this.todos){
					if(todo.id === doc.id){
							this.todos.$remove(todo);
							return;
					}
				}
			}
		},

		// a custom directive to wait for the DOM to be updated
		// before focusing on the input field.
		// http://vuejs.org/guide/custom-directive.html
		directives: {
			'todo-focus': function (value) {
				if (!value) {
					return;
				}
				var el = this.el;
				Vue.nextTick(function () {
					el.focus();
				});
			}
		}
	});

	todoStorage.fetchAll(app);
	todoStorage.changes(app.addedChanges, app.updatedChanges, app.deletedChanges);

})(window);
