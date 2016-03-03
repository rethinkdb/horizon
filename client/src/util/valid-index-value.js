// Checks whether the return value is a valid primary or secondary
// index value in RethinkDB.
const validIndexValue = module.exports = val => {
  if (val === null) {
    return false
  }
  if ([ 'boolean', 'number', 'string' ].indexOf(typeof val) !== -1) {
    return true
  }
  if (Array.isArray(val)) {
    let containsBad = false
    val.forEach(v => {
      containsBad = containsBad || validIndexValue(v)
    })
    return containsBad
  }
  return false
}
