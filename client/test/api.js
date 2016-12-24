import 'rxjs/add/operator/ignoreElements'
import 'rxjs/add/operator/concat'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        removeAllData,
        compareSetsWithoutVersion} from './utils'

import horizonObjectSuite from './horizonObject'

import storeSuite from './store'
import insertSuite from './insert'
import updateSuite from './update'
import upsertSuite from './upsert'
import replaceSuite from './replace'

import removeSuite from './remove'
import removeAllSuite from './removeAll'

import timesSuite from './times'
import authSuite from './auth'
import collectionSuite from './collection'
import findSuite from './find'
import findAllSuite from './findAll'
import orderSuite from './order'
import limitSuite from './limit'
import aboveSuite from './above'
import belowSuite from './below'
import chainingSuite from './chaining'

import findSubscriptionSuite from './findSub'
import findAllSubscriptionSuite from './findAllSub'
import aboveSubscriptionSuite from './aboveSub'
import belowSubscriptionSuite from './belowSub'
import orderLimitSubSuite from './orderLimitSub'

import aggregateSuite from './aggregate'
import aggregateSubSuite from './aggregateSub'

import unitAuthSuite from './unit/auth'

// This test suite covers various edge cases in the Horizon client library API.
// It does not cover correctness of the full system in various circumstances.
// The purpose of the API test suite is to act as a runnable, checkable spec for
// API of the client library. This also doesn't cover subscriptions, there is a
// separate test suite for that.

// Test the methods and event callbacks on the Horizon object.
describe('Horizon Object API', horizonObjectSuite)

// Test the core client library API
describe('Core API tests', () => {
  // The connection for our tests
  let horizon, data

  const getHorizon = () => horizon
  const getData = () => data

  // Set up the horizon connection before running these tests.
  before(done => {
    Horizon.clearAuthTokens()
    horizon = Horizon({lazyWrites: true})
    horizon.connect(err => done(err))
    horizon.onReady(() => {
      data = horizon('test_data')
      done()
    })
  })

  // Kill the horizon connection after running these tests.
  after(done => {
    let alreadyDone = false
    function wrappedDone(...args) {
      if (!alreadyDone) {
        alreadyDone = true
        return done(...args)
      }
    }
    horizon.disconnect()
    horizon.onDisconnected(() => wrappedDone())
  })

  // Test the mutation commands
  describe('Write API', () => {
    // Drop all data after each test
    afterEach(done => removeAllData(data, done))

    describe('Testing `store`', storeSuite(getData))
    describe('Testing `insert`', insertSuite(getData))
    describe('Testing `upsert`', upsertSuite(getData))
    describe('Testing `update`', updateSuite(getData))
    describe('Testing `replace`', replaceSuite(getData))
  }) // Storage API
  describe('Remove API', () => {
    describe('Testing `remove`', removeSuite(getData))
    describe('Testing `removeAll`', removeAllSuite(getData))
  })

  describe('Testing `times`', timesSuite(getData))
  describe('Testing authentication', authSuite(getHorizon))
  // Test the lookup API
  describe('Fetch API', () => {
    const testData = [
      {id: 1, a: 10},
      {id: 2, a: 20, b: 1},
      {id: 3, a: 20, b: 2},
      {id: 4, a: 20, b: 3},
      {id: 5, a: 60},
      {id: 6, a: 50},
    ]

    const getTestData = () => {
      return testData
    }

    // Drop all the existing data
    before(done => {
      removeAllData(data, done)
    })

    // Insert the test data and make sure it's in
    before(assertCompletes(() =>
      data.store(testData)
       .ignoreElements()
       .concat(data.fetch())
       .do(res => compareSetsWithoutVersion(res, testData))
    ))

    describe('Testing full collection read',
             collectionSuite(getHorizon, getData, getTestData))
    describe('Testing `find`', findSuite(getData))
    describe('Testing `findAll`', findAllSuite(getData))
    describe('Testing `order`', orderSuite(getData, getTestData))
    describe('Testing `limit`', limitSuite(getData))
    describe('Testing `above`', aboveSuite(getData))
    describe('Testing `below`', belowSuite(getData))
    describe('Test `above/below/limit` chaining variations',
             chainingSuite(getData))
  }) // Test the lookup API

  // Test the subscriptions API
  describe('Watch API', () => {

    // Drop all the existing data
    beforeEach(done => {
      removeAllData(data, done)
    })

    describe('Testing `find` subscriptions', findSubscriptionSuite(getData))
    describe('Testing `findAll` subscriptions', findAllSubscriptionSuite(getData))
    describe('Testing `above` subscriptions', aboveSubscriptionSuite(getData))
    describe('Testing `below` subscriptions', belowSubscriptionSuite(getData))
    describe('Testing `order.limit` subscriptions', orderLimitSubSuite(getData))
  }) // Test the subscriptions API
  describe('Serialization', () => {
    describe('Testing `times`', timesSuite(getData))
  })

  describe('Aggregate API', () => {
    describe('fetch', aggregateSuite(getData, getHorizon))
    describe('watch', aggregateSubSuite(getData, getHorizon))
  })

  describe('Unit tests', () => {
    describe('Auth', unitAuthSuite)
  })
}) // Core API tests
