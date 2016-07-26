import { assert } from 'chai'
import { stub } from 'sinon'
import { assertCompletes } from '../utils'

import { Observable } from 'rxjs/Observable'

import { applyChange,
         TermBase } from '../../src/ast'

const noop = () => {}

export default function unitAstSuite() {
  describe('applyChanges', () => {
    it('correctly changes an item with an array id in place', done => {
      const existingArray = [
        { id: [ 'A', 'B' ], val: 3 },
        { id: [ 'B', 'C' ], val: 4 },
      ]
      const change = {
        type: 'change',
        new_offset: null,
        old_offset: null,
        old_val: {
          id: [ 'B', 'C' ],
          val: 4,
        },
        new_val: {
          id: [ 'B', 'C' ],
          val: 5,
        },
      }
      const expected = [
        { id: [ 'A', 'B' ], val: 3 },
        { id: [ 'B', 'C' ], val: 5 },
      ]
      const obtained = applyChange(existingArray, change)
      assert.deepEqual(obtained, expected)
      done()
    })

    it('correctly deletes an uninitial item with an array id', done => {
      const existingArray = [
        { id: [ 'A', 'B' ], val: 3 },
        { id: [ 'B', 'C' ], val: 4 },
      ]
      const change = {
        type: 'uninitial',
        old_val: {
          id: [ 'B', 'C' ],
          val: 4,
        },
      }
      const expected = [
        { id: [ 'A', 'B' ], val: 3 },
      ]
      const obtained = applyChange(existingArray, change)
      assert.deepEqual(obtained, expected)
      done()
    })

    it('removes an old val from an array with type remove', done => {
      const existingArray = [
        { id: 21, val: 'A' },
        { id: 33, val: 'B' },
        { id: 16, val: 'C' },
      ]
      const change = {
        type: 'remove',
        new_val: null,
        old_val: { id: 2, val: 'B' },
        old_offset: 1,
        new_offset: null,
      }
      const expected = [
        { id: 21, val: 'A' },
        { id: 16, val: 'C' },
      ]
      const result = applyChange(existingArray, change)
      assert.deepEqual(result, expected)
      done()
    })

    it('adds a new item at the correct index with type add', done => {
      const existingArray = [
        { id: 21, val: 'A' },
        { id: 33, val: 'B' },
        { id: 16, val: 'C' },
      ]
      const change = {
        type: 'add',
        new_val: { id: 45, val: 'B.2' },
        new_offset: 2,
        old_val: null,
        old_offset: null,
      }
      const expected = [
        { id: 21, val: 'A' },
        { id: 33, val: 'B' },
        { id: 45, val: 'B.2' },
        { id: 16, val: 'C' },
      ]
      const result = applyChange(existingArray, change)
      assert.deepEqual(result, expected)
      done()
    })
  })

  describe('TermBase', () => {
    describe('toString', () => {
      it("should handle empty queries", () => {
        const query = {} // bogus query
        const legalMethods = []
        const term = new TermBase(noop, query, legalMethods)
        assert.typeOf(term.toString(), 'string')
      })
      it('should handle fully loaded (impossible) queries', () => {
        const query = {
          collection: 'foo',
          find: { id: 1 },
          find_all: [ { id: 1 }, { id: 2 } ],
          order: [ [ 'foo', 'bar' ], 'ascending' ],
          above: [ { foo: 'bar' }, 'open' ],
          below: [ { bar: 'foo' }, 'closed' ],
          limit: 10,
        }
        const term = new TermBase(noop, query, [])
        assert.typeOf(term.toString(), 'string')
      })
    }) // toString

    describe('watch', () => {
      beforeEach(() => {
        stub(TermBase, 'makePresentable')
      })
      afterEach(() => {
        TermBase.makePresentable.restore()
      })
      it('wont process results if rawChanges is true', () => {
        const randomResult = Math.random()
        const fakeSendRequest = () => randomResult // chosen by fair dice roll
        const term = new TermBase(fakeSendRequest, {}, [])
        const result = term.watch({ rawChanges: true })
        assert.equal(result, randomResult)
      })
      it('calls makePresentable if rawChanges is false', () => {
        const presentableResult = Math.random()
        TermBase.makePresentable.returns(presentableResult)
        const rawResult = Math.random()
        const fakeSendRequest = () => rawResult
        const term = new TermBase(fakeSendRequest, {}, [])
        const resultA = term.watch({ rawChanges: false })
        assert.equal(resultA, presentableResult)
        // check that default is rawChanges: false
        const resultB = term.watch()
        assert.equal(resultB, presentableResult)
      })
    }) // watch
  })
}

if (process.env.NODE_ENV === 'test') {
  describe('ast', unitAstSuite)
}
