#!/bin/bash

for path in `find server plugins plugin_router -name .babelrc | grep -v node_modules`; do
    {
        babel ${path%%.babelrc}/src -d ${path%%.babelrc}/dist -s true -w
    } &
done

wait
