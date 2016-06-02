import { Observable } from 'rxjs/Observable'

global.self = global
require('imports?this=>global!exports?global.fetch!isomorphic-fetch')

export default function fetchJSON(url) {
  return Observable.fromPromise(fetch(url))
    .mergeMap(response => response.json())
}
