'use strict'

Object.assign(module.exports, {
  deserialize: modifyType,
  serialize: jsonifyType,
})

const PRIMITIVES = [
  'string', 'number', 'boolean', 'function', 'symbol' ]

function modifyObject(doc) {
  Object.keys(doc).forEach(key => {
    doc[key] = modifyType(doc[key])
  })
  return doc
}

function modifyType(value) {
  if (value == null) {
    return value
  } else if (PRIMITIVES.indexOf(typeof value) !== -1) {
    return value
  } else if (Array.isArray(value)) {
    return value.map(modifyType)
  } else if (value.$reql_type$ === 'TIME') {
    let date = new Date()
    date.setTime(value.epoch_time * 1000)
    return date
  } else {
    return modifyObject(value)
  }
}

function jsonifyObject(doc) {
  Object.keys(doc).forEach(key => {
    doc[key] = jsonifyType(doc[key])
  })
  return doc
}

function jsonifyType(value) {
  if (value == null) {
    return value
  } else if (PRIMITIVES.indexOf(typeof value) !== -1) {
    return value
  } else if (Array.isArray(value)) {
    return value.map(jsonifyType)
  } else if (value instanceof Date) {
    return {
      $reql_type$: 'TIME',
      epoch_time: value.getTime() / 1000,
      timezone: 'Z',
    }
  } else {
    return jsonifyObject(value)
  }
}
