module.exports = function glob() {
  return typeof self !== 'undefined' ?
  self :
  typeof window !== 'undefined' ?
  window :
  typeof global !== 'undefined' ?
  global :
  {}
}
