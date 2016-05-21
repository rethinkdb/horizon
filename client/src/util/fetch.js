import { Observable } from 'rxjs/Observable'
import { fromPromise } from 'rxjs/observable/fromPromise'
import { mergeMap } from 'rxjs/operator/mergeMap'

global.self = global
require('imports?this=>global!exports?global.fetch!isomorphic-fetch')

export default function fetchJSON(url) {
  return Observable::fromPromise(fetch(url))
    ::mergeMap(response => response.json())
}
