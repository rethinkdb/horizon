#!/usr/bin/env python2
'''What? A Python script in a JavaScript library? Well I never...
This script is just for updating versions of Horizon, it doesn't get
packaged or have any use for consumers of Horizon itself.
'''

import json
import sys
from contextlib import contextmanager
from collections import OrderedDict

@contextmanager
def rewrite(filename):
    with open(filename, 'rb') as f:
        package_json = json.load(f, object_pairs_hook=OrderedDict)

    yield package_json

    with open(filename, 'wb') as f:
        json.dump(package_json, f, indent=2, separators=(',', ': '))
        f.write('\n') # json dump gives no trailing newline


def main(version):
    with rewrite('./client/package.json') as client_pkg:
        client_pkg['version'] = version

    with rewrite('./server/package.json') as server_pkg:
        server_pkg['version'] = version
        server_pkg['dependencies']['@horizon/client'] = version

    with rewrite('./cli/package.json') as cli_pkg:
        cli_pkg['version'] = version
        cli_pkg['dependencies']['@horizon/server'] = version


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except:
        print 'Please provide a version'