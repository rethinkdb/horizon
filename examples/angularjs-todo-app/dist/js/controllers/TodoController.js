(function () {
    'use strict';

    angular
        .module('todomvc')
        .controller('TodoCtrl', TodoCtrl);

    TodoCtrl.$inject = ['$filter', '$q'];

    function TodoCtrl($filter, $q) {
        const hz = new Horizon();
        const Tasks = hz("todomvc_tasks");

        self = this;
        self.allCompleted = false;

        self.addTask = addTask;
        self.removeTask = removeTask;
        self.editTask = editTask;
        self.editTaskSave = editTaskSave;
        self.editTaskCancel = editTaskCancel;
        self.toggleCompleted = toggleCompleted;
        self.toggleAll = toggleAll;
        self.removeCompletedTasks = removeCompletedTasks;

        init();

        function init() {
            Tasks.order("date", "ascending").watch().subscribe(function (tasks) {
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

            Tasks.store({
                title: self.taskTitle.trim(),
                completed: false,
                date: new Date()
            });

            self.taskTitle = '';
        }

        function removeTask(task) {
            Tasks.remove(task);
        }

        function editTask(task) {
            self.editedTask = task;

            self.taskCopy = angular.copy(task);
        }

        function editTaskSave(task) {
            self.editedTask = null;

            Tasks.update(task);
        }

        function editTaskCancel(task) {
            task.title = self.taskCopy.title;
            self.editedTask = null;
        }

        function toggleCompleted(task) {
            Tasks.update(task);
        }

        function toggleAll() {
            self.tasks.forEach(function (task) {
                task.completed = !self.allCompleted;
            });

            toggleCompleted(self.tasks);
        }

        function removeCompletedTasks() {
            var completed = self.tasks.filter(function (task) {
                return task.completed === true;
            });

            Tasks.remove(completed);
        }
    };
})();
