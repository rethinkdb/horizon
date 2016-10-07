'use strict';

const ignoreList = ['node_modules', '.git'];

const fs = require('fs');
const path = require('path');

const nameToPath = new Map();
const pathToPackage = new Map();

const handleFile = (dir, filename) => new Promise((resolve, reject) => {
  const subpath = path.join(dir, filename);
  fs.stat(subpath, (statErr, stats) => {
    if (statErr) {
      reject(statErr);
    } else if (stats.isDirectory()) {
      resolve(traverse(subpath));
    } else if (filename === 'package.json') {
      console.log(`got package.json at ${dir}`);
      fs.readFile(subpath, (readErr, data) => {
        if (readErr) {
          reject(readErr);
        } else {
          try {
            const parsed = JSON.parse(data);
            pathToPackage.set(dir, parsed);
            nameToPath.set(parsed.name, dir);
            resolve();
          } catch (parseErr) {
            reject(parseErr);
          }
        }
      });
    } else {
      resolve();
    }
  });
});

const traverse = (dir) =>
  new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        reject(err)
      } else {
        const promises = files.filter((filename) => !ignoreList.includes(filename))
          .map((filename) => handleFile(dir, filename));
        console.log(`${dir} got ${promises.length} promises`);
        Promise.all(promises).then(resolve).catch(reject);
      }
    });
  });

const linkDep = (fromPath, name) => new Promise((resolve, reject) => {
  console.log(`linkDep(${fromPath}, ${name})`);
  const dest = nameToPath.get(name);
  if (dest) {
    const fullFromPath = path.join(fromPath, 'node_modules', name);
    console.log(`linking ${fullFromPath} => ${dest}`);
    fs.symlink(dest, fullFromPath, (err) => {
      reject(err);
    });
  }
});

traverse('.').then(() =>
  Promise.all([...pathToPackage.keys()].map((path) =>
    Promise.all(Array.from(
      new Set([...Object.keys(pathToPackage.get(path).dependencies || {}),
               ...Object.keys(pathToPackage.get(path).peerDependencies || {})])
      ).map((dep) => linkDep(path, dep)))))).catch((err) => console.log(`${err.stack}`));
  /*
  console.log(`Got ${nameToPath.size}, ${pathToPackage.size}`);
  const promises = [];

  pathToPackage.forEach((parsed, path) => {
    console.log(`checking ${path}`);
    for (const key in parsed.dependencies || {}) {
      promises.push(linkDep(path, key));
    }
    for (const key in parsed.peerDependencies || {}) {
      promises.push(linkDep(path, key));
    }
  });

  return Promise.all(promises);
}).then(() => console.log('done')).catch((err) => console.log(`${err.stack}`));
*/

