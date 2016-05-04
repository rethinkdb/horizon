function timestamp() { return (new Date).getTime() / 1000; }

Object.entries = object =>
  Object.keys(object)
        .filter(key => object.hasOwnProperty(key))
        .map(key => [key, object[key]]);

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
    dashboard: Object.assign({},
                  ...Object.keys(adminQueries).map(k => ({[k]: []})))
  }
};

class Model {
  constructor() {
    this.horizon = Horizon();
    this.freezer = new Freezer(initialState);
    
    for (let [set, [command, opts]] of Object.entries(adminQueries))
      this.horizon.send(`admin:${command}`, opts)
                  .forEach(item => this.update(set, item));
    
    this.store.state.browser.getListener()
        .on("update", ch => this.onBrowserStateChange(ch));
        
        
    setInterval(() => this.updateGraph(), 1000);

    window.addEventListener("resize", ev => {
      if (!this.graph) return;
      let graphEl = document.getElementById("graph").parentNode;
      this.graph.option("width", graphEl.getBoundingClientRect().width);
    });
  }
  
  subscribe(fn) {
    this.freezer.on("update", fn);
  }
  
  get store() {
    return this.freezer.get();
  }
  
  update(set, {old_val, new_val, type, state}) {
    let data = this.store.data.dashboard[set];

    if (type === "initial")
      data.push(new_val);
    else if (type === "add")
      data.unshift(new_val);
    else if (type === "remove")
      data.splice(data.indexOf(old_val), 1);
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
  
  onBrowserStateChange({maxrows, collection}) {
    if (this.browserWatch) this.browserWatch.dispose();
    
    this.browserWatch = Horizon()(collection)
                        .order("id").limit(20).watch()
                        .forEach(x => this.store.data.browser.reset(x));
  }
}