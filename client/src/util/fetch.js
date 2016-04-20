const { Observable } = require('rxjs/Observable')
require('rxjs/add/observable/fromPromise')
const fetch = require('isomorphic-fetch')

function fetchJSON(url) {
  return Observable.fromPromise(fetch(url))
    .map(response => response.json())
}

module.exports = fetchJSON
