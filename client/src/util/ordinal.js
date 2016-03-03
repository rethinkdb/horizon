module.exports = x => {
  if ([ 11, 12, 13 ].indexOf(x) !== -1) {
    return `${x}th`
  } else if (x % 10 === 1) {
    return `${x}st`
  } else if (x % 10 === 2) {
    return `${x}nd`
  } else if (x % 10 === 3) {
    return `${x}rd`
  }
  return `${x}th`
}
