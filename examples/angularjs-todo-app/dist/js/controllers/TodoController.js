(function () {
    'use strict';

    angular
        .module('todomvc')
        .controller('TodoCtrl', TodoCtrl);

    TodoCtrl.$inject = ['TodoStorage', '$filter', '$q'];

    function TodoCtrl(TodoStorage, $filter, $q) {
        self = this;

        self.addTask = addTask;
        self.removeTask = removeTask;
        self.editTask = editTask;
        self.editTaskSave = editTaskSave;
        self.editTaskCancel = editTaskCancel;
        self.toggleCompleted = toggleCompleted;
        self.toggleAll = toggleAll;
        self.removeCompletedTasks = removeCompletedTasks;

        self.allCompleted = false;

        init();

        function init() {
            TodoStorage.watch().subscribe(function (tasks) {
                var defer = $q.defer();

                defer.resolve(tasks);

                defer.promise.then(function (tasks) {
                    self.remainingCount = $filter('filter')(tasks, { completed: false }).length;
                    self.completedCount = tasks.length - self.remainingCount;
                    self.allCompleted = !self.remainingCount;
                    self.tasks = tasks;
                });
            });
        }

        function addTask() {
            if (!self.taskTitle) return;

            var task = {
                title: self.taskTitle.trim(),
                completed: false,
                date: new Date()
            }

            self.taskTitle = '';

            TodoStorage.store(task);
        }

        function removeTask(task) {
            TodoStorage.remove(task);
        }

        function editTask(task) {
            self.editedTask = task;

            self.taskCopy = angular.copy(task);
        }

        function editTaskSave(task) {
            self.editedTask = null;

            delete task["$$hashKey"];

            TodoStorage.update(task);
        }

        function editTaskCancel(task) {
            task.title = self.taskCopy.title;
            self.editedTask = null;
        }

        function toggleCompleted(task) {
            delete task["$$hashKey"];

            TodoStorage.update(task);
        }

        function toggleAll(tasks) {
            tasks.forEach(function (task) {
                delete task["$$hashKey"];

                task.completed = !self.allCompleted;
            });

            toggleCompleted(tasks);
        }

        function removeCompletedTasks() {
            self.tasks.forEach(function (task) {
                if (task.completed === true) {
                    TodoStorage.remove(task);
                }
            });
        }
    };
})();
