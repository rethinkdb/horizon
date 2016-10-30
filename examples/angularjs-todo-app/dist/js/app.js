angular.module('todomvc', [])
    .run(function (Horizon) {
        Horizon.connect();
    });
