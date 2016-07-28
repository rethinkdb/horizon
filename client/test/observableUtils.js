import { assert } from 'chai'

// A clone of some of the ava api to make testing observables easier
class TestSpec {
  constructor(done) {
    this._done = done
    this._expectedPasses = 0
    this._expected = null
    this._equalityFunc = null
    this._obtained = []
    this._numPassed = 0
  }

  plan(length) {
    this._expectedPasses = length
  }

  pass() {
    this._numPasses += 1
  }

  fail(msg = 'Error is failed') {
    this._done(new Error(msg))
  }

  expect(expected, equalityFunc = assert.deepEqual) {
    this._expected = expected
    this._expectedPasses = expected.length
    this._equalityFunc = equalityFunc
  }

  end() {
    const expectedPasses = this._expectedPasses
    const expected = this._expected
    const passes = this._numPasses
    const obtained = this._obtained

    if (expected !== null) {
      if (expectedPasses < obtained.length) {
        this._done(new Error(
          `Expected only ${expectedPasses} values but got ${obtained.length}`))
        return
      } else if (expectedPasses > obtained.length) {
        this._done(new Error(
          `Expected ${expectedPasses} values but only got ${obtained.length}`))
        return
      }
      for (let i = 0; i < expectedPasses; i++) {
        if (this._equalityFunc(obtained[i], expected[i])) {
          this.pass()
        }
      }
    }
    if (expectedPasses < passes) {
      this._done(new Error(
        `Expected only ${expectedPasses} passes, but got ${passes}`))
    } else if (expectedPasses > passes) {
      this._done(new Error(
        `Expected ${expectedPasses} passes but got only ${passes}`))
    } else {
      this._done()
    }
  }
}

export function observableTest(func) {
  return done => {
    const t = new TestSpec(done)
    const result = func(t)
    if (typeof result.subscribe === 'function') {
      result.subscribe({
        next(val) {
          if (this._expected !== null) {
            t._obtained.push(val)
          }
        },
        error(e) {
          done(e)
        },
        complete() {
          t.end()
        },
      })
      return undefined
    } else {
      return result
    }
  }
}

export function oit(title, implementation) {
  it(title, observableTest(implementation))
}

export class ObservableTestPlan {
  constructor() {
    this._plan = []
    this._query = null
  }

  subscribeTo(query) {
    this._plan.push([ 'subscribe' ])
    this._query = query
    return this
  }

  expect(value, equality = assert.deepEqual) {
    this._plan.push([ 'expect', value, equality ])
    return this
  }

  beforeHand(action) {
    this._plan.push([ 'before_hand', action ])
    return this
  }

  do(action) {
    this._plan.push([ 'do', action ])
    return this
  }

  complete() {
    this._plan.push([ 'complete' ])
    return this
  }

  error(regex) {
    this._plan.push([ 'error', regex ])
    return this
  }
}

export function buildTestObservable(query, plan) {

}
