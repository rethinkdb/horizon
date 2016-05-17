const authSuite = global.authSuite = (getHorizon) => () => {
  let horizon
  before(() => {
    horizon = getHorizon()
  })
  it('gets an empty object when unauthenticated', done => {
    horizon.currentUser().fetch().subscribe(
      user => {
        assert.isObject(user)
        assert.deepEqual([], Object.keys(user))
      },
      err => done(err),
      complete => done()
    )
  })
  it('gets a normal user object when anonymous', done => {
    const myHorizon = Horizon({ secure: false, lazyWrites: true, authType: 'anonymous' })
    Horizon.clearAuthTokens()
    myHorizon.connect()
    myHorizon.currentUser().fetch().subscribe({
      next(user) {
        assert.isObject(user)
        assert.isString(user.id)
      },
      error: done,
      complete: done,
    })
  })
}
