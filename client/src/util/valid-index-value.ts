// This is a neat little trick that allows us to effectively have a
// circular type alias
export interface IndexArray extends Array<IndexValue> { }

export type IndexValue =
  string |
  number |
  boolean |
  ArrayBuffer |
  Date |
  IndexArray

// Checks whether the return value is a valid primary or secondary
// index value in RethinkDB.
export default function validIndexValue(val: any): val is IndexValue {
  if (val === null) {
    return false
  }
  if ([ 'boolean', 'number', 'string' ].indexOf(typeof val) !== -1) {
    return true
  }
  if (val instanceof ArrayBuffer) {
    return true
  }
  if (val instanceof Date) {
    return true
  }
  if (Array.isArray(val)) {
    for (const v of val) {
      if (!validIndexValue(v)) {
        return false
      }
    }
    return true
  }
  return false
}
