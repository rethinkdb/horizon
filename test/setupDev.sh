#!/bin/bash
set -e
pushd ../client
npm link
popd
pushd ../server
npm link ../client
npm link
popd
pushd ../cli
npm link ../server
npm link ../client
npm link
popd
echo 'Dev environment set up'
