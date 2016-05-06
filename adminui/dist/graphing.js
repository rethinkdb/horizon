
let timestamp = () => (new Date).getTime() / 1000;

class RealtimeGraph {
  constructor(selector, captions) {
    this.captions = captions; 
    this.selector = selector;
    this.graph = null;
  }
  
  attach() {
    this.graph = $(this.selector).epoch({
      type: "time.line",
      axes: ["left", "bottom"],
      data: this.captions.map(label => ({
        label: label, values: [{time: timestamp(), y: 0}]
      }))
    });
  }
  
  update(data) {
    if (!this.graph) return;
    this.graph.push(data.map(value => ({time: timestamp(), y: value})));
  }
  
  resize(ev) {
    if (!this.graph) return;
    let element = document.querySelector(this.selector).parentNode;
    this.graph.option("width", element.getBoundingClientRect().width);
  }
}