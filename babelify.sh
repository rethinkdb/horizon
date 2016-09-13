#!/usr/bin/env bash

dirs="server plugins plugin-router plugin-utils test"
for path in `find $dirs -name .babelrc | grep -v node_modules`; do
    {
        babel ${path%%.babelrc}/src -d ${path%%.babelrc}/dist -s true -w
    } &
done

wait
