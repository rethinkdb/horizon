
const typeDisplay = {
  string: 'AZ', number: "01", boolean: "==",
  object: "{ }", array: "[ ]", null: "0"
};

const dashQueries = {
  "clients": ["clients", {}],
  "requests": ["requests", {}],
  "cursors": ["requests", {live: true}],
  "collections": ["collections", {}]
};

let dashQueriesState =
  Object.assign({}, ...Object.keys(dashQueries).map(k => ({[k]: []})));

const initialState = {
  state: {
    browser: {
      query: {
        order: [["id"], "ascending"],
        collection: null,
        limit: 5,
      },
    },
    navigation: {
      selected: "Collections",
      items: [
        "Dashboard",
        "Users",
        "Collections",
        "Requests",
        "Servers"
      ]
    }
  },
  data: {
    browser: [],
    dashboard: dashQueriesState
  }
};

let expandState = new Map();

class Model {
  constructor() {
    this.horizon = Horizon();
    this.freezer = new Freezer(initialState);
    this.graph = new RealtimeGraph("#epoch", ["Requests", "Clients"]);
    
    for (let [target, [command, opts]] of Object.entries(dashQueries))
      this.horizon.send(`admin:${command}`, opts)
          .forEach(item => this.onDashboardUpdate(target, item));
    
    this.store.state.browser.getListener()
        .on("update", (ch, old) => this.onBrowserStateChange(ch, old));
        
    //this.store.state.browser.query.set("collection", "test");
    setInterval(() => this.onGraphUpdateTick(), 1000);
  }
  
  subscribe(fn) {
    this.freezer.on("update", fn);
  }
  
  get store() {
    return this.freezer.get();
  }
  
  browserPrev() {
    let {state: {browser: {query: state}}, data: {browser: data}} = this.store;
    let {order: [[orderIndex = "id"], orderDir = "ascending"]} = state;
    
    let queryDir = orderDir === "ascending" ? "descending" : "ascending";
    let filterDir = queryDir === "ascending" ? "above": "below";
    
    let query = {
      limit: state.limit,
      collection: state.collection,
      order: [[orderIndex], queryDir],
      [filterDir]: [{[orderIndex]: data[0][orderIndex]}, "open"]
    };
    
    this.horizon.send("query", query).toArray().forEach(output => {
      let value = output[output.length - 1][orderIndex];
      if (value) state.set({above: [{[orderIndex]: value}, "open"]});
    });
  }
  
  browserNext() {
    let {state: {browser: {query}}, data: {browser: data}} = this.store;
    let {order: [[orderIndex], orderDir]} = query;
    
    let value = data[data.length - 1][orderIndex];
    query.set({above: [{[orderIndex]: value}, "open"]});
  }
  
  browserSelect(collection) {
    this.browserClear();
    this.store.state.browser.query.set("collection", collection);
  }
  
  browserClear() {
    this.store.state.browser.query.reset(initialState.state.browser.query);
  }
  
  onGraphUpdateTick() {
    let {clients, cursors} = this.store.data.dashboard;
    this.graph.update([clients.length, cursors.length]);
  }
  
  onDashboardUpdate(target, change) {
    applyChange(this.store.data.dashboard[target], change);
  }
  
  onBrowserStateChange(change, old) {
    this.store.data.browser.reset([]);
    
    if (this.browserWatch)
      this.browserWatch.dispose();
      
    if (change.query.collection === null)
      return;
    
    this.horizon.send("subscribe", change.query.toJS())
      .forEach(c => applyChange(this.store.data.browser, c));
    
  }
}