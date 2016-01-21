#!/usr/bin/env bash
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
node --harmony-destructuring $DIR/serve.js "$@"
