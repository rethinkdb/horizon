'use strict'

module.exports = sort

function sort(a, b) {
  if (lt(a, b)) {
    return 1
  } else if (lt(b, a)) {
    return -1
  } else {
    return 0
  }
}

/* TODO: implement actual sort used by RethinkDB */
function lt(a, b) {
  return a < b
}
