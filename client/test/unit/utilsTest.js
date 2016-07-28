import validIndexValue from '../../src/util/valid-index-value'

export default function unitUtilsSuite() {
  describe('validIndexValue', () => {
    function assertValid(value) {
      assert.isTrue(validIndexValue(value),
                    `${JSON.stringify(value)} should be valid`)
    }
    function assertInvalid(value) {
      assert.isFalse(validIndexValue(value),
                    `${JSON.stringify(value)} should be invalid`)
    }
    it('disallows nulls', done => {
      const value = null
      assertInvalid(value)
      done()
    })
    it('disallows undefined', done => {
      const value = undefined
      assertInvalid(value)
      done()
    })
    it('allows booleans', done => {
      const value = true
      assertValid(value)
      done()
    })
    it('allows strings', done => {
      const value = 'some kinda string test'
      assertValid(value)
      done()
    })
    it('allows numbers', done => {
      const value = 12.33
      assertValid(value)
      done()
    })
    it('allows Dates', done => {
      const value = new Date()
      assertValid(value)
      done()
    })
    it('allows ArrayBuffers', done => {
      const value = new ArrayBuffer(1)
      assertValid(value)
      done()
    })
    it('disallows bare objects', done => {
      const value = { a: 1 }
      assertInvalid(value)
      done()
    })
    it('allows arrays of primitives', done => {
      const value = [ true, false, 1, "foo", new Date(), new ArrayBuffer(1) ]
      assertValid(value)
      done()
    })
    it('allows empty arrays', done => {
      const value = [ ]
      assertValid(value)
      done()
    })
    it('allows deeply nested arrays', done => {
      const value = [ [ ], [ [ [ [ 0, 1, [ ] ], [ 1 ] ] ] ] ]
      assertValid(value)
      done()
    })
    it('disallows arrays containing objects', done => {
      const value = [ 1, { a: 1 } ]
      assertInvalid(value)
      done()
    })
    it('disallows arrays with deeply nested objects', done => {
      const value = [ [ ], [ [ [ [ ], [ {} ] ] ] ] ]
      assertInvalid(value)
      done()
    })
  })
}
