#TodoMVC

A basic example of using [AngularJS](http://angularjs.org/) and [Horizon](http://horizon.io/) to create real-time TodoMVC app.

## Prerequisites

- [RethinkDB](https://www.rethinkdb.com/docs/install/) (The open-source database for the realtime web)
- [Horizon](http://horizon.io/install/) (A realtime, open-source backend for JavaScript apps)

## Installing

```
$ git clone git@github.com:rethinkdb/horizon.git
$ cd horizon/examples/angularjs-todo-app
$ hz init
$ cd dist && npm install
$ cd .. && hz serve --dev
```

## Credit

This TodoMVC application is built based on the [todomvc-angularjs-horizon](https://github.com/endetti/todomvc-angularjs-horizon).