(function () {
    'use strict';

    angular
        .module('todomvc')
        .factory('TodoStorage', TodoStorage);

    TodoStorage.$inject = ['Horizon'];

    function TodoStorage(Horizon) {
        const tasks = Horizon("todomvc_tasks");

        const service = {
            store: store,
            remove: remove,
            update: update,
            watch: watch
        };

        return service;

        function store(task) {
            tasks.store(task);
        }

        function remove(task) {
            tasks.remove(task);
        }

        function update(task) {
            tasks.update(task);
        }

        function watch() {
            return tasks.order("date", "ascending").watch();
        }

    };
})();
