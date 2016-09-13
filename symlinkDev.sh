#!/bin/bash

for i in plugins/*; do
    {
        cd $i
        plugins=`cat package.json \
                   | perl -n -e '/^ *"\@horizon-plugins\/([^"]*)\"/ && print "$1\n"'`;
        mkdir -p node_modules/@horizon
        mkdir -p node_modules/@horizon-plugins

        cd node_modules/@horizon
        ln -f -n -s ../../../../server server
        ln -f -n -s ../../../../plugin-utils plugin-utils

        cd ../@horizon-plugins
        for p in $plugins; do
            ln -f -n -s ../../../$p $p
        done
    } &
done

wait
