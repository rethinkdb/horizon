class ExecuteTerm {
  constructor(sendRequest, reql) {
    if (reql.build && typeof reql.build === 'function') {
      this._query = { reql: reql.build() }
    } else if (Array.isArray(reql)) {
      this._query = { reql }
    } else {
      throw new Error('Not a supported REQL type.')
    }
    this._sendRequest = sendRequest
  }

  watch() {
    return this._sendRequest('subscribe', this._query)
  }

  fetch() {
    return this._sendRequest('query', this._query)
  }
}

export default (sendRequest, reql) => new ExecuteTerm(sendRequest, reql)
