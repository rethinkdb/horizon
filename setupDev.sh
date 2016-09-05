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
link_dir cli "@horizon/server"
link_dir plugin-router
link_dir plugin-utils

# Link all the plugins - 'utils' must go first, and 'defaults' must go last
pushd plugins
plugin_names=($(ls -1d * | grep -v defaults))
plugin_modules=()
for plugin_name in "${plugin_names[@]}"; do
  link_dir "$plugin_name" \
           "@horizon/server" \
	   "@horizon/plugin-utils" \
	   "@horizon/client" \
	   "@horizon/plugin-router"
  plugin_modules+=("@horizon-plugins/$plugin_name")
done

link_dir defaults ${plugin_modules[@]}
popd

link_dir test "@horizon-plugins/defaults" "@horizon/plugin-router" "@horizon/server" "horizon"

green "Dev environment ready"
