import { assert } from 'chai'

import { applyChange } from '../../src/ast'

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
}

if (process.env.NODE_ENV === 'test') {
  describe('ast', unitAstSuite)
}
