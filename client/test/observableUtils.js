import { Observable } from 'rxjs/Observable'

import 'rxjs/add/observable/empty'
import 'rxjs/add/operator/concat'
import 'rxjs/add/operator/ignoreElements'
import 'rxjs/add/operator/multicast'

import { assert } from 'chai'

export function oit(title, getTest) {
  it(title, observableTest(getTest))
}

export function observableTest(getTest) {
  const testPlan = new ObservableTestPlan()
  getTest(testPlan)
  const obs = buildTestObservable(testPlan._plan)
  function testFunc() {
    return obs.toPromise()
  }
  testFunc.toString = () => getTest.toString()
  return testFunc
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

function log(name, obs) {
  return obs.do({
    next(x) { console.log(`${name} got`, x) },
    error(e) { console.log(`${name} errored`, e) },
    complete() { console.log(`${name} completed`) },
  })
}

export function buildTestObservable(plan) {
  validatePlan(plan)
  function next() {
    return plan.shift()
  }
  let step = 0
  // Rest of this function is simplified by assuming a valid plan
  let observable = Observable.empty()
  while (plan[0].type === 'beforeHand') {
    step++
    observable = observable.concat(log('beforeHand'+step, next().action))
  }
  const query = log('query', next().query)
  let skip = 0
  while (plan.length !== 0) {
    step++
    const action = next()
    if (action.type === 'expect') {
      observable = observable.concat(
        log('expect'+step, query.skip(skip++).take(1).do(action.observer)).ignoreElements()
      )
    }
    if (action.type === 'do') {
      observable = observable.concat(
        log('do'+step, action.action.ignoreElements())
      )
    }
  }
  return log('test'+step, observable)
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
  }
}
