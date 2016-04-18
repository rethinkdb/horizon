"use strict";

const fs = require("fs");
const jumptag = require("jumptag");
const stylus = require("stylus");

let readFileAsync = path =>
  new Promise((resolve, reject) =>
    fs.readFile(path, (err, data) => err ? reject(err) : resolve(data)));
    
let writeFileAsync = (path, content) =>
  new Promise((resolve, reject) =>
    fs.writeFile(path, content, err => err ? reject(err) : resolve(true)));
    
let stylusAsync = (content, include, outfn) =>
  new Promise((resolve, reject) =>
    stylus(content).include(include)
      .render((err, css) => err ? reject(err) : resolve(css)));
      
let params = process.argv.slice(2);

if (params[0] === "serve") {
  jumptag.server("src/components", "*.jump").listen(8001);
  console.log("Jumptag hot reload server running on 8001");
}
else {
  readFileAsync("src/styles/main.styl")
  .then(content => stylusAsync(content.toString("utf8"), `${__dirname}/src/styles`, "main.css"))
  .then(output => writeFileAsync("dist/main.css", output))
  .then(complete => console.log("Finished building styles"))
  .catch(err => console.log("Style ERROR:", err.stack));
  
  jumptag.watcher("src/components", "*.jump")
  .then(output => writeFileAsync("dist/bundle.js", output))
  .then(complete => console.log("Finished building templates"))
  .catch(err => console.log("Template ERROR:", err.stack));
}