#!/usr/bin/env bash
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
exec node --harmony-destructuring $DIR/src/main.js "$@"
