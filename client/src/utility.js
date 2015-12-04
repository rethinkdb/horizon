'use strict'

require('babel-polyfill')


// Checks whether the return value is a valid primary or secondary
// index value
function validIndexValue(val) {
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

// Helper method for terms that merges new fields into an existing
// object, throwing an exception if a field is merged in that already
// exists
function strictAssign(original, newFields) {
  Object.keys(newFields).forEach(key => {
    if (key in original) {
      throw new Error(`${key} is already defined.`)
    }
  })
  return Object.assign({}, original, newFields)
}


function ordinal(x) {
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

// setTimeout(0) in the browser has 5ms clamping. Promise.resolve()
// will be scheduled immediately after the currently executing task (a
// microtask)
function setImmediate(callback) {
  return Promise.resolve().then(callback)
}

// Validation helper
function checkArgs(name, args, {
                    nullable: nullable = false,
                    minArgs: minArgs = 1,
                    maxArgs: maxArgs = 1 } = {}) {
  if (minArgs === maxArgs && args.length !== minArgs) {
    let plural = minArgs === 1 ? '' : 's'
    throw new Error(`${name} must receive exactly ${minArgs} argument${plural}`)
  }
  if (args.length < minArgs) {
    let plural = minArgs === 1 ? '' : 's'
    throw new Error(`${name} must receive at least ${minArgs} argument${plural}.`)
  }
  if (args.length > maxArgs) {
    let plural = maxArgs === 1 ? '' : 's'
    throw new Error(`${name} accepts at most ${maxArgs} argument${plural}.`)
  }
  for (let i = 0; i < args.length; i++) {
    if (!nullable && args[i] === null) {
      let ordinality = maxArgs !== 1 ? ` ${ordinal(i + 1)}` : ''
      throw new Error(`The${ordinality} argument to ${name} must be non-null`)
    }
    if (args[i] === undefined) {
      throw new Error(`The ${ordinal(i + 1)} argument to ${name} must be defined`)
    }
  }
}


Object.assign(module.exports, {
  validIndexValue,
  strictAssign,
  ordinal,
  setImmediate,
  checkArgs,
})
