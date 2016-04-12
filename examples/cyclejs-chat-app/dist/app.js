'use strict'

;(function() {
  const makeDOMDriver = CycleDOM.makeDOMDriver
  const div = CycleDOM.div
  const input = CycleDOM.input
  const ul = CycleDOM.ul
  const li = CycleDOM.li
  const img = CycleDOM.img
  const span = CycleDOM.span

  // Intent grabs things from our sources and pulls out what events
  // we're interested in, as well as mapping to useful data (so
  // streams of strings, instead of observables of text input events)
  function intent(sources) {
    const horizonCollection = sources.horizon(sources.config.collectionName)
    // Every time the enter key is hit in the text box
    const enterHit$ = sources.DOM
            .select('#input')
            .events('keydown')
            .filter(ev => ev.keyCode === 13)
            .map(ev => ev.target.value || null)
            .share()
    // Every time the text in the input box changes
    const inputChange$ = sources.DOM
            .select('#input')
            .events('input')
            .map(ev => ev.target.value)
    // all our chats from the horizon server
    const messages$ = horizonCollection
            .order('datetime', 'descending')
            .limit(sources.config.chatLength)
            .watch()

    // Every time the user hits enter, store the message to the server
    // Note: this is an observable of observables
    const writeOps$$ = enterHit$.map(text =>
      horizonCollection.store({
        authorId: sources.config.authorId,
        datetime: new Date(),
        text,
      })
    )

    // This merges the stream of the input values with a stream that
    // returns null whenever enter is hit. This will clear the text
    // box after submitting.
    const inputValue$ = inputChange$.merge(enterHit$.map(() => null))
    return {
      inputValue$,
      writeOps$$,
      messages$,
    }
  }

  // Model takes our action streams and turns them into the stream of
  // app states
  function model(inputValue$, messages$) {
    return Rx.Observable.combineLatest(
      inputValue$.startWith(null),
      messages$.startWith([]),
      (inputValue, messages) => ({ messages, inputValue })
    )
  }

  // View takes the state and create a stream of virtual-dom trees for
  // the app.
  function view(state$) {
    // Displayed for each chat message.
    function chatMessage(msg) {
      return li('.message', { key: msg.id }, [
        img({
          height: '50', width: '50',
          src: `http://api.adorable.io/avatars/50/${msg.authorId}.png`,
        }),
        span('.text', msg.text),
      ])
    }

    return state$.map(
      state =>
        div([
          div('.row',
              ul(state.messages.map(chatMessage))),
          div('#input.row',
              input('.u-full-width', { value: state.inputValue, autoFocus: true })),
        ])
    )
  }

  // In main we just wire everything together
  function main(sources) {
    const intents = intent(sources)
    const state$ = model(intents.inputValue$, intents.messages$)
    return {
      // Send the virtual tree to the real DOM
      DOM: view(state$),
      // Send our messages to the horizon server
      horizon: intents.writeOps$$,
    }
  }

  // All the effects the app uses
  const drivers = {
    // Link the DOM driver to our app container
    DOM: makeDOMDriver('#app'),
    // Create a connection to the horizon server
    horizon: makeHorizonDriver(),
    // App-level configuration options
    config: () => ({
      // How many chats to show
      chatLength: 8,
      // RethinkDB table
      collectionName: 'cyclejs_messages',
      // unique-ish id created once when opening the page
      authorId: new Date().getMilliseconds(),
    }),
  }

  // Run the application
  Cycle.run(main, drivers)

  // Little CycleJS driver for horizon. This will probably be a small
  // standalone library at some point
  function makeHorizonDriver() {
    return function horizonDriver(writeOps$$) {
      // Send outgoing messages
      writeOps$$.switch().subscribe()
      // Return chat observable
      return Horizon({ lazyWrites: true })
    }
  }
})()
