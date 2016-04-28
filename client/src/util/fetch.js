import { Observable } from 'rxjs/Observable'
import { fromPromise } from 'rxjs/observable/fromPromise'
import { map } from 'rxjs/operator/map'
import fetch from 'isomorphic-fetch'

export default function fetchJSON(url) {
  return Observable::fromPromise(fetch(url))
    ::map(response => response.json())
}
