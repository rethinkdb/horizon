const PRIMITIVES = [
  'string', 'number', 'boolean', 'symbol' ]

function isPrimitive(val: any): string | number | boolean | symbol {
  return PRIMITIVES.indexOf(typeof val) !== -1
}

export interface PseudoTypeDate {
  $reql_type$: "TIME"
  epoch_time: number
  timezone: string
}

export function isPseudoTypeDate(value: any): value is PseudoTypeDate {
  return (value as PseudoTypeDate).$reql_type$ === "TIME"
}

function modifyObject(doc: Object): Object {
  Object.keys(doc).forEach((key: string) => {
    doc[key] = deserialize(doc[key])
  })
  return doc
}

export function deserialize(value: any): any {
  if (value == undefined) {
    return value
  } else if (isPrimitive(value)) {
    return value
  } else if (Array.isArray(value)) {
    return value.map(deserialize)
  } else if (isPseudoTypeDate(value)) {
    const date = new Date()
    date.setTime(value.epoch_time * 1000)
    return date
  } else if (value instanceof Object) {
    return modifyObject(value)
  }
}

function jsonifyObject(doc: Object): Object {
  Object.keys(doc).forEach((key: string) => {
    doc[key] = serialize(doc[key])
  })
  return doc
}

export function serialize(value: any): any {
  if (value == undefined) {
    return value
  } else if (isPrimitive(value)) {
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
