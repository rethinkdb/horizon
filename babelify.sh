#!/bin/bash

dirs="server server-utils plugins plugin_router"
for path in `find $dirs -name .babelrc | grep -v node_modules`; do
    {
        babel ${path%%.babelrc}/src -d ${path%%.babelrc}/dist -s true -w
    } &
done

wait
