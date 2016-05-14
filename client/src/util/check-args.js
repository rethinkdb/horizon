import ordinal from './ordinal.js'

// Validation helper
export default function checkArgs(name, args, {
                    nullable: nullable = false,
                    minArgs: minArgs = 1,
                    maxArgs: maxArgs = 1 } = {}) {
  if (minArgs === maxArgs && args.length !== minArgs) {
    const plural = minArgs === 1 ? '' : 's'
    throw new Error(`${name} must receive exactly ${minArgs} argument${plural}`)
  }
  if (args.length < minArgs) {
    const plural1 = minArgs === 1 ? '' : 's'
    throw new Error(
      `${name} must receive at least ${minArgs} argument${plural1}.`)
  }
  if (args.length > maxArgs) {
    const plural2 = maxArgs === 1 ? '' : 's'
    throw new Error(
      `${name} accepts at most ${maxArgs} argument${plural2}.`)
  }
  for (let i = 0; i < args.length; i++) {
    if (!nullable && args[i] === null) {
      const ordinality = maxArgs !== 1 ? ` ${ordinal(i + 1)}` : ''
      throw new Error(`The${ordinality} argument to ${name} must be non-null`)
    }
    if (args[i] === undefined) {
      throw new Error(
        `The ${ordinal(i + 1)} argument to ${name} must be defined`)
    }
  }
}
