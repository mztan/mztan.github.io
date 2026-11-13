#!/usr/bin/env python3
"""Copy production into the development preview without changing production."""

import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
PROD = ROOT / 'surface-inputs'
DEV = ROOT / 'surface-inputs-dev'
ENVIRONMENT_SCRIPT = '  <script src="../environment.js" defer></script>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--overwrite-dev', action='store_true', help='Explicitly replace existing dev edits with current production.')
    args = parser.parse_args()
    if DEV.exists() and not args.overwrite_dev:
        parser.error('Dev already exists. Commit/review its changes before using --overwrite-dev; that option discards dev-only edits.')
    if DEV.is_symlink() or not PROD.is_dir():
        parser.error('Unexpected source or destination.')
    if DEV.exists():
        shutil.rmtree(DEV)
    shutil.copytree(PROD, DEV)
    home = DEV / 'index.html'
    html = home.read_text()
    if ENVIRONMENT_SCRIPT not in html:
        html = html.replace('</head>', ENVIRONMENT_SCRIPT + '\n</head>', 1)
    home.write_text(html)
    # Keep the copied launcher's transport test compatible with the shared environment script.
    regression = DEV / 'tests' / 'regression.test.js'
    if regression.is_file():
        source = regression.read_text()
        source = source.replace(
            "const scripts = [...html.matchAll(/<script[^>]*\\bsrc=\"([^\"]+)\"/g)].map(value => value[1]);",
            "const scripts = [...html.matchAll(/<script[^>]*\\bsrc=\"([^\"]+)\"/g)].map(value => value[1]).filter(value => value !== '../environment.js');",
        )
        regression.write_text(source)
    print('Copied production into dev and linked the URL-derived environment script.')
    print('Telemetry and Google Forms uploads are unchanged; development runs can write to existing collectors.')
    print('No files were committed or deployed. No production files were changed.')


if __name__ == '__main__':
    main()
