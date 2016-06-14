import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/fromPromise'
import 'rxjs/add/operator/mergeMap'

global.self = global
require('imports?this=>global!exports?global.fetch!isomorphic-fetch')

export default function fetchJSON(url) {
  return Observable.fromPromise(fetch(url))
    .mergeMap(response => {
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.indexOf('application/json') !== -1) {
        return response.json()
      } else {
        return response.text().then(resp => ({
          error: 'Response was not json',
          responseBody: resp,
        }))
      }
    })
}
