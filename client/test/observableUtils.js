import { Observable } from 'rxjs/Observable'

import 'rxjs/add/observable/empty'
import 'rxjs/add/operator/concat'

import { assert } from 'chai'

export function oit(title, getTest) {
  it(title, observableTest(getTest))
}

export function observableTest(getTest) {
  const testPlan = new ObservableTestPlan()
  getTest(testPlan)
  const obs = buildTestObservable(testPlan._plan)
  return done => obs.subscribe({ error: done, complete: done })
}

export class ObservableTestPlan {
  constructor() {
    this._plan = []
    this._query = null
  }

  beforeHand(action) {
    this._plan.push({
      type: 'beforeHand',
      action,
    })
    return this
  }

  subscribeTo(query) {
    this._plan.push({
      type: 'subscribeTo',
      query,
    })
    this._query = query
    return this
  }

  expect(expected, equality = assert.deepEqual) {
    this._plan.push({
      type: 'expect',
      subtype: 'next',
      observer: nextObserver(expected, equality),
    })
    return this
  }

  do(action) {
    this._plan.push({ type: 'do', action })
    return this
  }

  expectComplete() {
    this._plan.push({
      type: 'expect',
      subtype: 'complete',
      observer: completionObserver(),
    })
    return this
  }

  expectError(regex) {
    this._plan.push({
      type: 'expect',
      subtype: 'error',
      observer: errorObserver(regex),
    })
    return this
  }
}

export function buildTestObservable(plan) {
  validatePlan(plan)
  // Rest of this function is simplified by assuming a valid plan
  let observable = Observable.empty()
  while (plan[0].type === 'beforeHand') {
    observable.concat(plan.shift().action)
  }
  const query = plan.shift().query
  let skip = 0
  for (const action of plan) {
    if (action.type === 'expect') {
      observable = observable.concat(
        query.skip(skip).take(1).do(action.observer)
      )
      skip += 1
    }
    if (action.type === 'do') {
      observable = observable.concat(action.action)
    }
  }
}

// Before we build an observable from the plan, validate it.
export function validatePlan(plan) {
  let currentAction = 'test start'
  for (const rawAction of plan) {
    const action = (rawAction.type === 'expect') ?
            `expect_${rawAction.subtype}` :
            rawAction.type
    if (!isLegal(currentAction, action)) {
      throw new Error(`Invalid plan: ${action} cannot follow ${currentAction}`)
    } else {
      currentAction = action
    }
  }
}

const legalTransitions = {
  'test start': [ 'beforeHand', 'subscribeTo' ],
  beforeHand: [ 'beforeHand', 'subscribeTo' ],
  subscribeTo: [ 'do', 'expect_next', 'expect_error', 'expect_complete' ],
  do: [ 'do', 'expect_next', 'expect_error', 'expect_complete' ],
  expect_next: [ 'do', 'expect_next', 'expect_error', 'expect_complete' ],
  expect_error: [],
  expect_complete: [],
}

function isLegal(currentAction, nextAction) {
  return legalTransitions[currentAction].indexOf(nextAction) !== -1
}

// An observer that should error matching a particular regex
function errorObserver(regex) {
  return {
    next(x) {
      throw new Error(`Expected an error but got ${JSON.stringify(x)}`)
    },
    error(e) {
      if (!e.message.match(regex)) {
        throw new Error(`Expected error message to match ${regex} ` +
                        `but got "${e.message}"`)
      }
    },
    complete() {
      throw new Error('Expected error but completed successfully')
    },
  }
}

// An observer that should complete successfully
function completionObserver() {
  return {
    next(x) {
      throw new Error(`Expected completion but got ${JSON.stringify(x)}`)
    },
  }
}

// An observer that ensures the next value received matches expectations
function nextObserver(expected, equality) {
  return {
    next(val) {
      return equality(val, expected)
    },
    complete() {
      throw new Error(
        `Expected value but completed instead: ${JSON.stringify(expected)}`)
    },
  }
}
