'use strict'

require('babel-polyfill')
const chai = require('chai')
chai.config.showDiff = true
const assert = chai.assert

const util = require('../src/utility.js')

describe('argParse', () => {
  it('adds defaults when args empty', done => {
    const args = []
    const specs = [ { type: 'options', default: { x: 'y' } } ]
    const result = util.argParse('x', args, specs)
    assert.deepEqual(result, [ { x: 'y' } ])
    done()
  })
  it('adds defaults when arg missing', done => {
    const args = [ () => {} ]
    const specs = [
      { type: 'options', default: { x: 'y' } },
      { type: 'callback' },
    ]
    const [ opts, cb ] = util.argParse('y', args, specs)
    assert.deepEqual(opts, { x: 'y' })
    assert.equal(cb, args[0])
    done()
  })
  it('errors when a mandatory callback is missing', done => {
    const args = [ { x: 'y' } ]
    const specs = [
      { type: 'callback' },
      { type: 'options', default: { y: 'x' } },
    ]
    try {
      const [ ] = util.argParse('blarg', args, specs)
      done(new Error(`Didn't raise an error`))
    } catch (e) {
      assert.equal(e.message, 'The 1st argument to `blarg` must be a callback.')
      done()
    }
  })
  it(`doesn't return defaults if values are passed`, done => {
    const args = [ { arg: 'provided' }, () => {} ]
    const specs = [
      { type: 'options', default: { arg: 'default' } },
      { type: 'callback', default: null },
    ]
    const [ opt, cb ] = util.argParse('foo', args, specs)
    assert.deepEqual(opt, args[0])
    assert.deepEqual(cb, args[1])
    done()
  })
  it('merges options defaults', done => {
    const args = [ { a: 'foo' } ]
    const specs = [ { type: 'options', default: { b: 'bar' } } ]
    const [ opts ] = util.argParse('flrb', args, specs)
    assert.deepEqual(opts, { a: 'foo', b: 'bar' })
    done()
  })
  it('returns empty object for options when no default', done => {
    const args = []
    const specs = [ { type: 'options' } ]
    const [ opts ] = util.argParse('asdf', args, specs)
    assert.deepEqual(opts, {})
    done()
  })
  it('errors if a spec contains an unknown type', done => {
    const args = []
    const specs = [ { type: 'number', default: 1 } ]
    try {
      util.argParse('plogue', args, specs)
      done(new Error(`Error not raised`))
    } catch (e) {
      assert.equal(e.message, 'The 1st spec for `plogue` has the ' +
                   'unrecognized type `number`')
      done()
    }
  })
  it('errors if an optional spec precedes ' +
     'another spec with the same type', done => {
    const args = [ {} ]
    const specs = [
      { type: 'options', default: { y: 'z' } },
      { type: 'options', default: { x: 'y' } },
    ]
    try {
      util.argParse('fwip', args, specs)
      done(new Error(`Didn't raise an exception`))
    } catch (e) {
      assert.equal(e.message,
                   'The 1st spec for `fwip` is optional, and the spec that ' +
                   'follows it also has the type `options`.')
      done()
    }
  })
  it('correctly determines which argument is which', done => {
    const spec = [
      { type: 'options', default: { x: 'y' } },
      { type: 'callback', default: null },
    ]
    const lambda = () => {}
    const argss = [
      [],
      [ { x: 'z' } ],
      [ lambda ],
      [ { g: 'f' }, lambda ],
    ]
    const expected = [
      [ { x: 'y' }, null ],
      [ { x: 'z' }, null ],
      [ { x: 'y' }, lambda ],
      [ { x: 'y', g: 'f' }, lambda ],
    ]
    for (let i = 0; i < argss; i++) {
      const [ opts, cb ] = util.argParse('foo', argss[i], spec)
      assert.deepEqual(opts, expected[i][0])
      assert.equal(cb, expected[i][1])
    }
    done()
  })
})
