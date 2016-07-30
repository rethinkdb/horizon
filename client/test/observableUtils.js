import { assert } from 'chai'

export function oit(title, implementation) {
  it(title, observableTest(implementation))
}

export class ObservableTestPlan {
  constructor() {
    this._plan = []
    this._query = null
  }

  beforeHand(action) {
    this._plan.push({
      type: 'before',
      action,
    })
    return this
  }

  subscribeTo(query) {
    this._plan.push({
      type: 'subscribe',
      action(observer) {
        return query.subscribe(observer)
      },
    })
    this._query = query
    return this
  }

  expect(expected, equality = assert.deepEqual) {
    this._plan.push({
      type: 'expect',
      test(val) {
        return equality(val, expected)
      },
    })
    return this
  }

  execute(action) {
    this._plan.push({
      type: 'execute',
      action() {
        action.subscribe()
      },
    })
    return this
  }

  expectComplete() {
    this._plan.push({ type: 'complete' })
    return this
  }

  expectError(regex) {
    this._plan.push({
      type: 'error',
      test(e) {
        return Boolean(e.message.match(regex))
      },
    })
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

  expect(val) {
    this.plan.shift().test(val)
  }

  execute() {
    this.plan.shift().action.subscribe()
  }

  errorMatch(e) {
    const errTest = this.plan.shift()
    if (errTest.test(e)) {
      this.done()
    } else {
      this.done(`Expected error to match ${errTest.regex}. Got: "${e.message}"`)
    }
  }

  // Calls the test's done method with a user error if provided. If
  // it's not provided, the test will pass successfully as long as the
  // test plan is empty (we've hit all the milestones)
  done(msg) {
    if (msg instanceof Error) {
      this._done(msg)
    } else if (typeof msg === 'string') {
      this._done(new Error(msg))
    } else if (this.plan.length === 0) {
      this._done(new Error(`Test plan wasn't empty. Next was: ${this.plan[0]}`))
    } else {
      this._done()
    }
  }

  // Observer methods below

  next(val) {
    if (this.plan[0].type === 'expect') {
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


export function expectRunEncoder(plan) {
  let skip = 0
  let take = 0
  const runs = []
  let currentRun = { expects: [] }
  for (const p of plan) {
    if (p.type === 'expect') {
      currentRun.expects.push(p)
      take += 1
    } else {
      currentRun.skip = skip
      currentRun.take = take
      runs.push(currentRun)
      currentRun = { expects: [] }
      skip += take
      take = 0
    }
  }
  if (currentRun.expects.length > 0) {
    currentRun.skip = skip
    currentRun.take = take
    runs.push(currentRun)
  }
  return runs
}
