import { WebSocketSubject } from 'rxjs/observable/dom/WebSocketSubject'
import { Subject } from 'rxjs/Subject'

// The upstream has a bug where ._output isn't reset properly.
// See: https://github.com/ReactiveX/rxjs/issues/1863

// Every time a WebSocket's socket is set to null, we reset the output
// Subject if necessary
Object.defineProperty(WebSocketSubject.prototype, 'socket', {
  get: function() {
    return this.__socket
  },
  set: function(newValue) {
    if (newValue === null && (!this._output || this._output.isStopped)) {
      this._output = new Subject()
    }
    this.__socket = newValue
  },
})
