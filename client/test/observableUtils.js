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

  beforeHand(action) {
    this._plan.push([ 'before', action ])
    return this
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

  execute(action) {
    this._plan.push([ 'execute', action ])
    return this
  }

  expectComplete() {
    this._plan.push([ 'complete' ])
    return this
  }

  expectError(regex) {
    this._plan.push([ 'error', regex ])
    return this
  }
}

export function buildTestObservable(query, plan) {
  // First, put all beforehand observables concatted and
  // .ignoreElements() onto the start of the query

  // Next, subscribe to the query with our observer
  // Next,
}

class TestObserver {

  constructor(plan, done) {
    this.plan = plan
    this._done = done
  }

  // Check out the type of the next instruction
  peekType() {
    if (this.plan[0] !== undefined) {
      return this.plan[0][0]
    } else {
      return undefined
    }
  }

  expect(val) {
    const [ t, expected, compare ] = this.plan.shift()
    compare(val, expected)
  }

  execute() {
    const [ t, action ] = this.plan.shift()
    action.subscribe()
  }

  errorMatch(e) {
    const [ t, regex ] = this.plan.shift()
    if (e.message.match(regex)) {
      this.done()
    } else {
      this.done(`Expected error to match ${regex}. Got: "${e.message}"`)
    }
  }

  // Calls the test's done method with a user error if provided. If
  // it's not provided, the test will pass successfully as long as the
  // test plan is empty (we've hit all the milestones)
  done(msg) {
    if (msg instanceof Error) {
      this._done(msg)
    } else if (typeof 'msg' === 'string') {
      this._done(new Error(msg))
    } else if (this.plan.length === 0) {
      this._done(new Error(`Test plan wasn't empty. Next was: ${this.plan[0]}`))
    } else {
      this._done()
    }
  }

  // Observer methods below

  next(val) {
    let peek = this.peekType()
    if (peek === 'expect') {
      this.expect(val)
    } else {
    }
    while (this.peekType('execute')) {
      this.execute()
    }
    if (this.plan.length === 0) {
      this.done()
    }
  }

  error(e) {
    if (this.peekType('error')) {
      this.errorMatch(e)
    } else {
      this.done(e)
    }
  }

  complete() {
    if (this.peekType('complete')) {
      this.done()
    } else {
      this.done(`Planned ${this.plan[0][0]} but completed instead`)
    }
  }
}
