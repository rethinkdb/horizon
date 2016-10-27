function modifyObject(doc) {
  Object.keys(doc).forEach(key => {
    doc[key] = deserialize(doc[key])
  })
  return doc
}

export function deserialize(value) {
  if (value != null && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(deserialize)
    } else if (value.$reql_type$ === 'TIME') {
      const date = new Date()
      date.setTime(value.epoch_time * 1000)
      return date
    }
    return modifyObject(value)
  }
  return value
}

function jsonifyObject(doc) {
  Object.keys(doc).forEach(key => {
    doc[key] = serialize(doc[key])
  })
  return doc
}

export function serialize(value) {
  if (value != null && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(serialize)
    } else if (value instanceof Date) {
      return {
        $reql_type$: 'TIME',
        epoch_time: value.getTime() / 1000,
        // Rethink will serialize this as "+00:00", but accepts Z
        timezone: 'Z',
      }
    }
    return jsonifyObject(value)
  }
  return value
}
