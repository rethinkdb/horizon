#!/usr/bin/env bash
set -e

if [[ "$1" == "--clean" ]]; then
  do_clean=true
fi

green () {
    echo -e "\033[1;32m== $1 \033[0m"
}

# $1: path to module to link
# $...: dependencies to link into this module
link_dir () {
  dir=$1
  shift

  pushd $dir
  if [[ "$do_clean" == "true" ]]; then
    echo Removing $dir/node_modules
    rm -rf node_modules
  fi

  green "Unlinking $dir"
  npm unlink

  green "Linking $dir deps"
  while (( "$#" )); do
    npm link "$1"
    shift
  done

  green "Linking $dir"
  npm link --unsafe-perm --cache-min 9999999
  popd
}

link_dir client
link_dir server "@horizon/client"
link_dir plugin-utils

# Link all the routers - base links to the server, the rest link to base
link_dir router/base "@horizon/server"

pushd router
router_names=($(ls -1d * | grep -v base))
for router_name in "${router_names[@]}"; do
  link_dir "$router_name" "@horizon/base-router"
done
popd

# Link all the plugins, 'defaults' must go last
pushd plugins
plugin_names=($(ls -1d * | grep -v defaults))
plugin_modules=()
for plugin_name in "${plugin_names[@]}"; do
  link_dir "$plugin_name" "@horizon/plugin-utils" "@horizon/server"
  plugin_modules+=("@horizon-plugins/$plugin_name")
done

link_dir defaults ${plugin_modules[@]}
popd

link_dir cli "@horizon/express-router" "@horizon-plugins/defaults" "@horizon/server" "@horizon/plugin-utils"

link_dir test "@horizon-plugins/defaults" "@horizon/base-router" "@horizon/plugin-utils" "horizon"

green "Dev environment ready"
