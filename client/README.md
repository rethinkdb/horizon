# Horizon Client Library

The Horizon client library. Built to interact with the [Horizon Server](/server) API. Provides all the tooling to build a fully-functional and reactive front-end web application.

## Building

Running `npm install` for the first time will build the browser bundle and lib files.

1. `npm install`
2. `npm run dev` (or `npm run build` or `npm run compile`, see below)

### Build Options

Command             | Description
--------------------|----------------------------
npm run build       | Build dist/horizon.js minified production browser bundle
npm run builddebug  | Build with webpack and output debug logging
npm run compile     | Compile src to lib for CommonJS module loaders (such as webpack, browserify)
npm run coverage    | Run code coverage tool - `istanbul`
npm run dev         | Watch directory for changes, build dist/horizon.js unminified browser bundle
npm run devtest     | Serve `dist` directory to build app and continuously run tests
npm test            | Run tests in node
npm run lint -s     | Lint src
npm run test        | Run tests

## Running tests

* `npm test` or open `dist/test.html` in your browser after getting setup and while you also have Horizon server with the `--dev` flag running on `localhost`.
* You can spin up a dev server by cloning the horizon repo and running `node serve.js` in `test` directory in repo root. Then tests can be accessed from <http://localhost:8181/test.html>. Source maps work properly when served via http, not from file system. You can test the production version via `NODE_ENV=production node serve.js`. You may want to use `test/setupDev.sh` to set the needed local npm links for development.

## Docs


### Getting Started

[horizon.io/docs/getting-started](https://horizon.io/docs/getting-started/).

### APIs

* Horizon API - [horizon.io/api/horizon/](https://horizon.io/api/horizon/)
* Collection API - [horizon.io/api/collection/](https://horizon.io/api/collection/)

## Users and Groups

[horizon.io/docs/users/](https://horizon.io/docs/users/)

## Setting Permissions

[horizon.io/docs/permissions/](http://horizon.io/docs/permissions/)

### Clearing tokens

Sometimes you may wish to delete all authentication tokens from localStorage. You can do that with:

``` js
// Note the 'H'
Horizon.clearAuthTokens()
```
