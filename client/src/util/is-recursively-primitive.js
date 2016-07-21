import isPlainObject from 'is-plain-object'

// Whether an object is all primitives all the way down. We consider
// functions non-primitives, lump Dates and ArrayBuffers into
// primitives, and objects and arrays that contain only recursively
// primitive items to be primitives.
export function isRecursivelyPrimitive(value) {
  if (value === null) {
    return true
  }
  if (value === undefined) {
    return false
  }
  if (typeof value === 'function') {
    return false
  }
  if ([ 'boolean', 'number', 'string' ].indexOf(typeof value) !== -1) {
    return true
  }
  if (value instanceof Date || value instanceof ArrayBuffer) {
    return true
  }
  const isPOJO = isPlainObject(value)
  const isArray = Array.isArray(value)
  if (!isPOJO && !isArray && typeof value === 'object') {
    return false
  }
  if (isArray) {
    for (const v of value) {
      if (!isRecursivelyPrimitive(v)) {
        return false
      }
    }
    return true
  }
  if (isPOJO) {
    for (const key of Object.keys(value)) {
      if (!isRecursivelyPrimitive(value[key])) {
        return false
      }
    }
    return true
  }
  return false
}
