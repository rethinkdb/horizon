let timestamp = () => (new Date).getTime() / 1000;

let findRecord = (data, id) => data.findIndex(item => id === item.id);

Object.entries = object =>
  Object.keys(object)
        .filter(key => object.hasOwnProperty(key))
        .map(key => [key, object[key]]);

const typeDisplay = {
  string: 'AZ', number: "01", boolean: "==",
  object: "{ }", array: "[ ]", 
  null: "X",
};

const adminQueries = {
  "clients": ["clients", {}],
  "requests": ["requests", {}],
  "cursors": ["requests", {live: true}],
  "collections": ["collections", {}]
};

const initialState = {
  state: {
    browser: {
      maxrows: 50,
      collection: null,
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
    dashboard: Object.assign({},
                  ...Object.keys(adminQueries).map(k => ({[k]: []})))
  }
};

let expandState = new Map();

class Model {
  constructor() {
    this.horizon = Horizon();
    this.freezer = new Freezer(initialState);
    
    for (let [target, [command, opts]] of Object.entries(adminQueries))
      this.horizon.send(`admin:${command}`, opts)
                  .forEach(item => this.onDashboardUpdate(target, item));
    
    this.store.state.browser.getListener()
        .on("update", ch => this.onBrowserStateChange(ch));
        
    setInterval(() => this.updateGraph(), 1000);

    window.addEventListener("resize", ev => {
      if (!this.graph) return;
      let graphEl = document.getElementById("graph").parentNode;
      this.graph.option("width", graphEl.getBoundingClientRect().width);
    });
    
    this.store.state.browser.set("collection", "reddit");
  }
  
  subscribe(fn) {
    this.freezer.on("update", fn);
  }
  
  get store() {
    return this.freezer.get();
  }
  
  update(data, {old_val, new_val, type, state}) {
    if (type === "initial")
      data.push(new_val);
    else if (type === "add")
      data.unshift(new_val);
    else if (type === "remove") {
      let target = findRecord(data, old_val.id);
      if (target > -1) data.splice(target, 1);
    }
    else if (type === "change") {
      let target = findRecord(data, old_val.id);
      if (target > -1) data[target].reset(new_val);
    }
  }
  
  updateGraph() {
    if (!this.graph) return;
    
    let {clients, cursors} = this.store.data.dashboard;

    this.graph.push([
      {time: timestamp(), y: clients.length},
      {time: timestamp(), y: cursors.length}
    ]);
  }

  initializeGraph() {
    this.graph = $("#graph").epoch({
      type: "time.line",
      axes: ["left", "bottom"],
      data: [
        {label: "Clients", values: [{time: timestamp(), y: 0}]},
        {label: "Requests", values: [{time: timestamp(), y: 0}]}
      ]
    });
  }
  
  onDashboardUpdate(target, change) {
    this.update(this.store.data.dashboard[target], change);
  }
  
  onBrowserStateChange({maxrows, collection}) {
    if (this.browserWatch) this.browserWatch.dispose();
    
    this.browserWatch = Horizon()(collection)
                        .order("id").limit(20).watch({rawChanges: true})
                        .forEach(x => this.update(this.store.data.browser, x));
  }
}