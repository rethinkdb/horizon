/*jshint quotmark:false */
/*jshint white:false */
/*jshint trailing:false */
/*jshint newcap:false */
var app = app || {};

(function () {
	'use strict';

	const Utils = app.Utils;

	//Setup RethinkDB
	const Fusion = require("Fusion");
	const fusion = new Fusion("localhost:8181", {
		secure: true
	});

	// Generic "model" object. You can use whatever
	// framework you want. For this application it
	// may not even be worth separating this logic
	// out, but we do this to demonstrate one way to
	// separate out parts of your application.
	app.TodoModel = function () {
		this.todos = [];
		this.onChanges = [];
		this.todosDB = fusion("todos_react");

		this.todosDB.value().then((function(result){
			this.todos = result ? result : [];
			this.inform();
		}).bind(this));
	};

	app.TodoModel.prototype.subscribe = function (onChange) {
		this.onChanges.push(onChange);
	};

	app.TodoModel.prototype.inform = function () {
		this.todosDB.store(this.todos);
		this.onChanges.forEach(function (cb) { cb(); });
	};

	app.TodoModel.prototype.addTodo = function (title) {
		const newTodo = {
			id: Utils.uuid(),
			title: title,
			completed: false
		};

		this.todosDB.store(newTodo);
		this.todos = this.todos.concat(newTodo);

		// May want to stop this inform since we don't want to blindly save all todos
		this.inform();
	};

	app.TodoModel.prototype.toggleAll = function (checked) {
		// Note: it's usually better to use immutable data structures since they're
		// easier to reason about and React works very well with them. That's why
		// we use map() and filter() everywhere instead of mutating the array or
		// todo items themselves.
		this.todos = this.todos.map(function (todo) {
			return Utils.extend({}, todo, {completed: checked});
		});

		this.inform();
	};

	app.TodoModel.prototype.toggle = function (todoToToggle) {
		this.todos = this.todos.map((function (todo) {
			if (todo !== todoToToggle){
				return todo;
			} else {
				const updatedTodo = Utils.extend({}, todo, {completed:!todo.completed});
				this.todosDB.replace(updatedTodo);
				return updatedTodo;
			}
		}).bind(this));

		this.inform();
	};

	app.TodoModel.prototype.destroy = function (todo) {
		this.todos = this.todos.filter((function (candidate) {
			if (candidate !== todo){
				return true;
			} else {
				this.todosDB.remove(candidate);
				return false;
			}
		}).bind(this));

		this.inform();
	};

	app.TodoModel.prototype.save = function (todoToSave, text) {
		this.todos = this.todos.map((function (todo) {
			if (todo !== todoToSave){
				return todo;
			} else {
				const newTodo = Utils.extend({}, todo, {completed: !todo.completed});
				this.todosDB.save(newTodo);
				return newTodo;
			}
		}).bind(this));

		this.inform();
	};

	app.TodoModel.prototype.clearCompleted = function () {
		this.todos = this.todos.filter((function (todo) {
			if (todo.completed){
				this.todosDB.remove(todo);
				return false;
			} else {
				return true;
			}
		}).bind(this));

		this.inform();
	};

})();
