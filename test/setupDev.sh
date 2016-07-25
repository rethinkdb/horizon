#!/bin/bash
set -e

green () {
    echo -e "\033[1;32m== $1 \033[0m"
}

if [ "$1" == '--clean' ]; then
 green 'Removing old node_modules dirs if present'
 if [ -d ../client/node_modules ]; then
   echo Removing client/node_modules
   rm -r ../client/node_modules
 fi
 if [ -d ../server/node_modules ]; then
  echo Removing server/node_modules
  rm -r ../server/node_modules
 fi
 if [ -d ../cli/node_modules ]; then
  echo Removing cli/node_modules
  rm -r ../cli/node_modules
 fi
fi

pushd ../client
green 'Unlinking existing client'
npm unlink
green 'Linking client'
npm link --unsafe-perm --cache-min 9999999
popd

pushd ../server
green 'Unlinking existing server'
npm unlink
green 'Linking server'
npm link @horizon/client
npm link --cache-min 9999999
popd

pushd ../cli
green 'Unlinking existing horizon cli'
npm unlink
green 'Linking horizon cli'
npm link @horizon/server
npm link --cache-min 9999999
popd

green 'Dev environment set up'
