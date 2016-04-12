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

        exports.app = new Vue({

                // the root element that will be compiled
                el: '.todoapp',
                debug: true,

                // app initial state
                data: {
                        todos: [],
                        newTodo: '',
                        editedTodo: null,
                        visibility: 'all'
                },

                // watch todos change for localStorage persistence
                // watch: {
                //      // todos: {
                //      //      deep: false,
                //      //      handler: todoStorage.save,
                //      // },
                // },

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
                                                this.updateTodo(todo);
                                        }.bind(this));
                                }
                        },
                },

                // methods that implement data logic.
                //  note there's no DOM manipulation here at all.
                methods: {

                        addTodo: function () {
                                const value = this.newTodo && this.newTodo.trim();
                                if (!value) {
                                        return;
                                }
                                const todo = {
                                        title: value,
                                        completed: false,
                                        datetime: new Date(),
                                };

                                todoStorage.save(todo);
                                this.newTodo = '';
                        },

                        removeTodo: function (todo){
                                todoStorage.remove(todo);
                        },

                        editTodo: function (todo) {
                                this.beforeEditCache = todo.title;
                                this.editedTodo = todo;
                                this.updateTodo(todo);
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

                        updateTodo: function(todo){
                                todoStorage.update(todo);
                        },

                        cancelEdit: function (todo) {
                                this.editedTodo = null;
                                todo.title = this.beforeEditCache;
                        },

                        removeCompleted: function () {
                                filters.completed(this.todos).forEach(this.removeTodo);
                        },
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

        todoStorage.changes().subscribe(todos => exports.app.todos = todos)

})(window);
