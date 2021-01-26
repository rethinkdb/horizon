const PRIMITIVES = [
  'string', 'number', 'boolean', 'function', 'symbol' ]

function modifyObject(doc) {
  Object.keys(doc).forEach(key => {
    doc[key] = deserialize(doc[key], true)
  })
  return doc
}

class ProtocolError extends Error {
  constructor(msg, errorCode) {
    super(msg)
    this.errorCode = errorCode
  }
  toString() {
    return `${this.message} (Code: ${this.errorCode})`
  }
}

export function deserialize(value, nested) {
  if (value == null) {
    return value
  } else if (PRIMITIVES.indexOf(typeof value) !== -1) {
    return value
  } else if (Array.isArray(value)) {
    return value.map(deserialize)
  } else if (value.$reql_type$ === 'TIME') {
    const date = new Date()
    date.setTime(value.epoch_time * 1000)
    return date
  } else if (value.error !== undefined && nested !== true) {
    throw new ProtocolError(value.error, value.error_code)
  } else {
    return modifyObject(value)
  }
}

function jsonifyObject(doc) {
  Object.keys(doc).forEach(key => {
    doc[key] = serialize(doc[key])
  })
  return doc
}

export function serialize(value) {
  if (value == null) {
    return value
  } else if (PRIMITIVES.indexOf(typeof value) !== -1) {
    return value
  } else if (Array.isArray(value)) {
    return value.map(serialize)
  } else if (value instanceof Date) {
    return {
      $reql_type$: 'TIME',
      epoch_time: value.getTime() / 1000,
      // Rethink will serialize this as "+00:00", but accepts Z
      timezone: 'Z',
    }
  } else {
    return jsonifyObject(value)
  }
}
