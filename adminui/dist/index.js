
const typeDisplay = {
  string: 'AZ', number: "01", boolean: "==",
  object: "{ }", array: "[ ]",  null: "0"
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
      order: ["id"],
      maxrows: 50,
      collection: null,
    },
    navigation: {
      selected: "Dashboard",
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
        .on("update", ch => this.onBrowserStateChange(ch));
        
    this.store.state.browser.set("collection", "quakes");
    setInterval(() => this.onGraphUpdateTick(), 1000);
  }
  
  subscribe(fn) {
    this.freezer.on("update", fn);
  }
  
  get store() {
    return this.freezer.get();
  }
  
  onGraphUpdateTick() {
    let {clients, cursors} = this.store.data.dashboard;
    this.graph.update([clients.length, cursors.length]);
  }
  
  onDashboardUpdate(target, change) {
    applyChange(this.store.data.dashboard[target], change);
  }
  
  onBrowserStateChange({maxrows, collection, order}) {
    if (this.browserWatch) this.browserWatch.dispose();
    
    let query = Horizon()(collection);
    
    if (order) query = query.order(...order);
    if (maxrows) query = query.limit(maxrows);
    
    this.browserWatch = query.watch({rawChanges: true})
                        .forEach(c => applyChange(this.store.data.browser, c));
  }
}