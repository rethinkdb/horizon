#!/usr/bin/env bash
set -e

do_clean=$([ "$1" == "--clean" ])

green () {
    echo -e "\033[1;32m== $1 \033[0m"
}

# $1: path to module to link
# $...: dependencies to link into this module
link_dir () {
  dir=$1
  shift

  pushd $dir
  if [ do_clean = "true" ]; then
    echo Removing $dir/node_modules
    rm -r node_modules
  fi

  green "Unlinking $dir"
  npm unlink
  green "Linking $dir"

  while (( "$#" )); do
    npm link "$1"
    shift
  done

  npm link --unsafe-perm --cache-min 9999999
  popd
}

link_dir client
link_dir server "@horizon/client"
link_dir cli "@horizon/server"
link_dir plugins/utils "@horizon/server"

plugin_names=($(ls -1d plugins/* | grep -v -e utils -e defaults))
plugin_modules=()
for plugin_name in "${plugin_names[@]}"; do
  link_dir "plugins/$plugin_name" "@horizon/server" "@horizon/plugin-utils"
  plugin_modules+=("@horizon/plugin-$plugin_name")
done

link_dir plugins/defaults ${plugin_modules[@]}
link_dir test "@horizon/plugin-defaults" "@horizon/plugin-router" "@horizon/server" "@horizon"

green "Dev environment ready"
