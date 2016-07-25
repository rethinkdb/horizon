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
  })
}
