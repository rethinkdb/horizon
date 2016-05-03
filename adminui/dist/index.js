
function timestamp() { return (new Date).getTime() / 1000; }

const sets = {
  "clients": ["clients", {}],
  "requests": ["requests", {}],
  "cursors": ["requests", {live: true}],
  "collections": ["collections", {}]
};

const state = {
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
};

let entries = object =>
  Object.keys(object)
        .filter(key => object.hasOwnProperty(key))
        .map(key => [key, object[key]]);
        
class Model {
  constructor() {
    this.graph = null;
    this.horizon = Horizon();
    
    this.store = new Freezer(
      Object.assign({state: state}, 
        entries(sets).reduce((prev, [k,v]) =>
          Object.assign({[k]: []}, prev), {})));
    
      
    for (let [set, [command, opts]] of entries(sets))
      this.horizon.send(`admin:${command}`, opts)
                  .forEach(item => this.update(set, item));

    setInterval(() => this.updateGraph(), 1000);

    window.addEventListener("resize", ev => {
      if (!this.graph) return;
      let graphEl = document.getElementById("graph").parentNode;
      this.graph.option("width", graphEl.getBoundingClientRect().width);
    });
  }
  
  navigate(place) {
    this.data().state.navigation.set({selected: place});
  }

  data() {
    return this.store.get();
  }

  subscribe(fn) {
    this.store.on("update", fn);
  }

  updateGraph() {
    if (this.graph) {
      let data = this.data();

      this.graph.push([
        {time: timestamp(), y: data.clients.length},
        {time: timestamp(), y: data.cursors.length}
      ]);
    }
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

  update(set, {old_val, new_val, type, state}) {
    let data = this.data()[set];

    //console.log(set, type, new_val);

    if (type === "initial")
      data.push(new_val);
    else if (type === "add")
      data.unshift(new_val);
    else if (type === "remove")
      data.splice(data.indexOf(old_val), 1);
  }
}
