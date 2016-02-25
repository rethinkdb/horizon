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
  subscribeOrObservable,
})
