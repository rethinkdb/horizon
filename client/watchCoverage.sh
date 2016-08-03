#!/bin/bash

while true; do
  inotifywait -e close_write,moved_to,create  test/unit |
  while read -r directory events filename; do
    npm run unit-coverage || true
  done
done
