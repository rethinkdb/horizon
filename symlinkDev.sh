#!/bin/bash

for i in plugins/*; do
    {
        cd $i
        plugins=`cat package.json \
                   | perl -n -e '/^ *"\@horizon\/plugin-([^"]*)\"/ && print "$1\n"' \
                   | grep -v router`;
        mkdir -p node_modules/@horizon
        cd node_modules/@horizon
        ln -f -n -s ../../../../server server
        for p in $plugins; do
            ln -f -n -s ../../../$p plugin-$p
        done
    } &
done

wait
