#!/usr/bin/env python3
"""Verify the development deployment without running tasks or uploading results."""

from html.parser import HTMLParser
from pathlib import Path
import subprocess
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
DEV = ROOT / 'surface-inputs-dev'
PROD = ROOT / 'surface-inputs'
ENTRIES = ['index.html', 'keyboard/index.html'] + [
    f'touchpad/{prefix}{name}.html'
    for prefix in ('', 'uxr/')
    for name in ('index', 'scroll', 'textselection', 'zoom')
]


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'img', 'audio', 'source') and attrs.get('src'):
            self.resources.append(attrs['src'])
        if tag == 'link' and attrs.get('href'):
            self.resources.append(attrs['href'])
        if tag == 'a' and attrs.get('class') == 'test-link':
            self.links.append(attrs['href'])


def main():
    subprocess.run(['git', 'diff', '--exit-code', '--', 'surface-inputs/'], cwd=ROOT, check=True)
    subprocess.run(['git', 'diff', '--cached', '--exit-code', '--', 'surface-inputs/'], cwd=ROOT, check=True)
    home = (DEV / 'index.html').read_text()
    assert 'id="development-label"' in home and 'DEVELOPMENT' in home
    assert 'Development</title>' in home
    for entry in ENTRIES:
        path = DEV / entry
        parser = Assets()
        parser.feed(path.read_text())
        for ref in parser.resources + parser.links:
            url = urlsplit(ref)
            assert not url.scheme and not url.netloc, (entry, ref, 'External runtime resource')
            target = (path.parent / unquote(url.path)).resolve()
            assert target.is_relative_to(DEV), (entry, ref, 'Reference leaves dev environment')
            if target.is_dir():
                target /= 'index.html'
            assert target.is_file(), (entry, ref)
    for name in ('transport.js', 'transport-ui.js', 'keyboard/script.js',
                 'touchpad/event-logger.js', 'touchpad/fitts-law.js', 'touchpad/scripts_dc.js'):
        assert (DEV / name).read_bytes() == (PROD / name).read_bytes(), (name, 'Collection or engine changed')
    assert not (DEV / 'dev-bootstrap.js').exists()
    assert not (ROOT / 'development-tools').exists()
    assert (DEV / 'touchpad/arcade-targeting.css').is_file()
    for doc in ('AGENTS.md', 'README.md', 'DEPLOYMENT.md'):
        text = (ROOT / doc).read_text()
        assert 'surface-inputs-dev/' in text and 'surface-inputs/' in text
    result = subprocess.run(['python3', 'scripts/sync-dev.py'], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode != 0 and 'Dev already exists' in result.stderr
    print('10 dev entry points retain environment-local assets; telemetry/engine code unchanged.')
    print('Development labeling and non-overwrite sync behavior verified. Production diff is empty.')
    print('No task was run and no telemetry or Google Form request was sent by this check.')


if __name__ == '__main__':
    main()
