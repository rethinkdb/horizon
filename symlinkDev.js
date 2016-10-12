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
      fs.readFile(subpath, (readErr, data) => {
        if (readErr) {
          reject(readErr);
        } else {
          try {
            const fullDir = path.resolve(dir);
            const parsed = JSON.parse(data);
            pathToPackage.set(fullDir, parsed);
            nameToPath.set(parsed.name, fullDir);
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
        Promise.all(promises).then(resolve).catch(reject);
      }
    });
  });

const mkdir = (dir, done) => {
  let promise = Promise.resolve();
  dir.split(path.sep).slice(1).reduce((acc, item) => {
    acc.push(path.join(acc[acc.length - 1] || '/', item));
    return acc;
  }, []).map((path) => {
    promise = promise.then(() => {
      return new Promise((resolve, reject) => {
        fs.exists(path, (exists) => {
          if (exists) {
            resolve();
          } else {
            fs.mkdir(path, (mkdirErr) => {
              if (mkdirErr && mkdirErr.code !== 'EEXIST') {
                reject(mkdirErr);
              } else {
                resolve();
              }
            });
          }
        });
      });
    });
  });
  
  promise.then(done).catch(done);
};

const linkDep = (fromPath, name) => new Promise((resolve, reject) => {
  const dest = nameToPath.get(name);
  if (dest) {
    const fullFromPath = path.join(fromPath, 'node_modules', name);
    mkdir(path.dirname(fullFromPath), (mkdirErr) => {
      if (mkdirErr) {
        reject(mkdirErr);
      } else {
        fs.unlink(fullFromPath, () => {
          console.log(`Linking ${fullFromPath} => ${dest}`);
          fs.symlink(dest, fullFromPath, (symlinkErr) => {
            if (symlinkErr) {
              reject(symlinkErr);
            } else {
              resolve();
            }
          })
        });
      }
    });
  } else {
    resolve();
  }
});

traverse('.').then(() =>
  Promise.all([...pathToPackage.keys()].map((path) =>
    Promise.all(Array.from(new Set(
        [...Object.keys(pathToPackage.get(path).dependencies || {}),
         ...Object.keys(pathToPackage.get(path).peerDependencies || {}),
         ...Object.keys(pathToPackage.get(path).devDependencies || {})])
      ).map((dep) => linkDep(path, dep))
    ))
  )
).catch((err) => console.log(`${err.stack}`));

