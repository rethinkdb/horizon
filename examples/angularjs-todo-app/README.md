#TodoMVC-Horizon

A basic example of using [AngularJS](http://angularjs.org/) and [Horizon](http://horizon.io/) to create real-time TodoMVC app.

## Prerequisites

- [RethinkDB](https://www.rethinkdb.com/docs/install/) (The open-source database for the realtime web)
- [Horizon](http://horizon.io/install/) (A realtime, open-source backend for JavaScript apps)

## Installing

```
$ mkdir todomvc && cd todomvc
$ git clone git@github.com:endetti/todomvc-angularjs-horizon.git .
$ hz init
$ cd dist && npm install
$ cd .. && hz serve --dev
```
