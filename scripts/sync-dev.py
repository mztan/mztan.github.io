#!/usr/bin/env python3
"""Copy production into the development preview without changing production."""

import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
PROD = ROOT / 'surface-inputs'
DEV = ROOT / 'surface-inputs-dev'
MARKER = '\n        <p id="development-label" style="margin:12px 0 0;color:#f2e8d0;font:500 12px sans-serif;letter-spacing:.12em">DEVELOPMENT</p>'


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
    if '<h1 id="page-title">Surface Inputs <span>Arcade</span></h1>' not in html:
        raise SystemExit('Production heading changed; add the development label manually before publishing.')
    html = html.replace('<h1 id="page-title">Surface Inputs <span>Arcade</span></h1>',
                        '<h1 id="page-title">Surface Inputs <span>Arcade</span></h1>' + MARKER, 1)
    html = html.replace('<title>Surface Inputs Arcade</title>', '<title>Surface Inputs Arcade · Development</title>', 1)
    home.write_text(html)
    print('Copied surface-inputs/ to surface-inputs-dev/ and added Development label.')
    print('Telemetry and Google Forms uploads are unchanged; development runs can write to existing collectors.')
    print('No files were committed or deployed. No production files were changed.')


if __name__ == '__main__':
    main()
