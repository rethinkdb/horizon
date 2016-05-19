// Checks whether the return value is a valid primary or secondary
// index value in RethinkDB.
export default function validIndexValue(val) {
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
    let isValid = true
    val.forEach(v => {
      isValid = isValid && validIndexValue(v)
    })
    return isValid
  }
  return false
}
