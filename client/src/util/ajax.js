const { Observable } = require('rxjs/Observable')
const rx = require('rxjs/add/observable/fromPromise')
const fetch = require('isomorphic-fetch')

function getJSON(url) {
  return Observable.fromPromise(fetch(url))
    .map(response => response.json())
}

module.exports = fetch
