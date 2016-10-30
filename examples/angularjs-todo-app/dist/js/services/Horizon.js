(function () {
    'use strict';

    angular
        .module('todomvc')
        .factory('Horizon', HorizonFactory);

    function HorizonFactory() {
        if (typeof Horizon === 'undefined') {
            throw new Error('The Horizon client library is required');
        }

        return new Horizon;
    };
})();
