'use strict'

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

function assign(...args) {
  return Object.assign({}, ...args)
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

// Validation helper
function checkArgs(name, args, {
                    nullable: nullable = false,
                    minArgs: minArgs = 1,
                    maxArgs: maxArgs = 1 } = {}) {
  if (minArgs === maxArgs && args.length !== minArgs) {
    const plural = minArgs === 1 ? '' : 's'
    throw new Error(`${name} must receive exactly ${minArgs} argument${plural}`)
  }
  if (args.length < minArgs) {
    const plural = minArgs === 1 ? '' : 's'
    throw new Error(`${name} must receive at least ${minArgs} argument${plural}.`)
  }
  if (args.length > maxArgs) {
    const plural = maxArgs === 1 ? '' : 's'
    throw new Error(`${name} accepts at most ${maxArgs} argument${plural}.`)
  }
  for (let i = 0; i < args.length; i++) {
    if (!nullable && args[i] === null) {
      const ordinality = maxArgs !== 1 ? ` ${ordinal(i + 1)}` : ''
      throw new Error(`The${ordinality} argument to ${name} must be non-null`)
    }
    if (args[i] === undefined) {
      throw new Error(`The ${ordinal(i + 1)} argument to ${name} must be defined`)
    }
  }
}

// Takes a spec of arguments (current types allowed: options,
// callback) and normalizes the results of the ...spread operator so
// that optional and default arguments are handled.
// Each spec in specs has three keys:
//   `type`: either 'options' or 'callback' currently
//   `default`: default value to use if the argument isn't present.
//
// Example call:
// function myFun(...args) {
//   const [ callback, options ] = argParse('myFun', args, [
//     { type: 'callback', default: null },
//     { type: 'options', default: { foo: 'x' } },
//   ])
//  }
function argParse(name, args, specs) {
  specs.forEach((spec, index) => {
    if (index > 0 && spec.type === specs[index - 1].type) {
      throw new Error(`The ${ordinal(index)} spec for \`${name}\` ` +
                      `is optional, and the spec that follows it also ` +
                      `has the type \`${spec.type}\`.`)
    }
  })
  const results = []
  let argIndex = 0 // keeps track of which arg we're examining
  for (let specIndex = 0; specIndex < specs.length; specIndex++) {
    const spec = specs[specIndex]
    const arg = args[argIndex]
    switch (spec.type) {
    case 'options':
      if (Array.isArray(arg) || typeof arg !== 'object') {
        // Not an options object, so we just use the default options
        // Note that if spec.default is undefined, this will still
        // push an empty options object.
        results.push(assign(spec.default))
      } else {
        // Got an options object. Merge it with defaults and push it
        results.push(assign(spec.default, arg))
        argIndex++
      }
      break
    case 'callback':
      if (typeof arg !== 'function') {
        if (spec.default !== undefined) {
          results.push(spec.default)
        } else {
          // No default was provided, so the argument isn't optional
          throw new Error(`The ${ordinal(argIndex + 1)} argument ` +
                          `to \`${name}\` must be a callback.`)
        }
      } else {
        // We have a proper callback, move to the next arg
        results.push(arg)
        argIndex++
      }
      break
    default:
      throw new Error(`The ${ordinal(specIndex + 1)} spec for \`${name}\` ` +
                      `has the unrecognized type \`${spec.type}\``)
    }
  }
  return results
}

function subscribeOrObservable(observable) {
  return (...args) => {
    if (args.length > 0) {
      return observable.subscribe(...args)
    } else {
      return observable
    }
  }
}


Object.assign(module.exports, {
  validIndexValue,
  assign,
  ordinal,
  checkArgs,
  argParse,
  subscribeOrObservable,
})
