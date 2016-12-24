import {TokenStorage, FakeStorage} from '../../src/auth'

export default function unitAuthSuite() {
  describe('TokenStorage', () => {
    let fakeStorage
    let tokenStore
    beforeEach(() => {
      fakeStorage = new FakeStorage()
      tokenStore = new TokenStorage({
        authType: 'token',
        storage: fakeStorage,
        path: 'testHorizon',
      })
    })
    it('sets a token and retrieves it back', done => {
      const fakeData = 'some kinda long テスト string'
      tokenStore.set(fakeData)
      const obtained = tokenStore.get()
      assert.equal(obtained, fakeData)
      done()
    })
    it('overwrites a token for the same path', done => {
      const string1 = 'Test string 1'
      const string2 = 'Test string 2'
      tokenStore.set(string1)
      tokenStore.set(string2)
      const obtained = tokenStore.get()
      assert.equal(obtained, string2)
      done()
    })
    it('keeps storage from different paths separate', done => {
      const otherTokens = new TokenStorage({
        authType: 'token',
        path: 'secondHorizon',
        storage: fakeStorage,
      })
      tokenStore.set('A')
      otherTokens.set('B')
      const obtainedA = tokenStore.get()
      assert.equal(obtainedA, 'A')
      const obtainedB = otherTokens.get()
      assert.equal(obtainedB, 'B')
      done()
    })
    it('removes tokens', done => {
      tokenStore.set('A')
      tokenStore.remove()
      assert.isUndefined(tokenStore.get())
      done()
    })
    it('removes tokens independently by path', done => {
      const otherToken = new TokenStorage({
        authType: 'token',
        path: 'anotherPath',
        storage: fakeStorage,
      })
      tokenStore.set('A')
      otherToken.set('B')
      tokenStore.remove()
      assert.equal(otherToken.get(), 'B')
      assert.isUndefined(tokenStore.get())
      done()
    })
  })
}
