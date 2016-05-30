import { Observable } from 'rxjs/Observable'
require('rxjs/add/observable/fromPromise')
require('rxjs/add/operator/mergeMap')

global.self = global
require('imports?this=>global!exports?global.fetch!isomorphic-fetch')

export default function fetchJSON(url) {
  return Observable.fromPromise(fetch(url))
    .mergeMap(response => response.json())
}
