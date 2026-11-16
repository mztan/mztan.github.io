#!/usr/bin/env python3
"""Verify the development deployment without running tasks or uploading results."""

from html.parser import HTMLParser
from pathlib import Path
import argparse
import re
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-production-changes', action='store_true',
                        help='Use only for an owner-authorized promotion; requires runtime parity.')
    args = parser.parse_args()
    if not args.allow_production_changes:
        subprocess.run(['git', 'diff', '--exit-code', '--', 'surface-inputs/'], cwd=ROOT, check=True)
        subprocess.run(['git', 'diff', '--cached', '--exit-code', '--', 'surface-inputs/'], cwd=ROOT, check=True)
    else:
        paths = subprocess.check_output(['git', 'ls-files', 'surface-inputs-dev'], cwd=ROOT, text=True).splitlines()
        for path in paths:
            relative = Path(path).relative_to('surface-inputs-dev')
            if relative.suffix == '.md' or relative.name == 'UPSTREAM.json' or relative.parts[0] == 'tests':
                continue
            assert (DEV / relative).read_bytes() == (PROD / relative).read_bytes(), (str(relative), 'Promotion runtime mismatch')
    subprocess.run(['git', 'diff', '--exit-code', '--', 'jvision/'], cwd=ROOT, check=True)
    subprocess.run(['git', 'diff', '--cached', '--exit-code', '--', 'jvision/'], cwd=ROOT, check=True)
    home = (DEV / 'index.html').read_text()
    assert 'src="../environment.js" defer' in home
    assert 'id="development-label"' not in home
    assert '<title>Surface Inputs Arcade</title>' in home
    for entry in ENTRIES:
        path = DEV / entry
        parser = Assets()
        parser.feed(path.read_text())
        for ref in parser.resources + parser.links:
            url = urlsplit(ref)
            assert not url.scheme and not url.netloc, (entry, ref, 'External runtime resource')
            target = (path.parent / unquote(url.path)).resolve()
            assert target.is_relative_to(DEV) or (entry == 'index.html' and target == ROOT / 'environment.js'), (entry, ref, 'Reference leaves dev environment')
            if target.is_dir():
                target /= 'index.html'
            assert target.is_file(), (entry, ref)
    for name in ('transport.js', 'transport-ui.js', 'touchpad/event-logger.js'):
        assert (DEV / name).read_bytes() == (PROD / name).read_bytes(), (name, 'Collection code changed')
    hooks = {'keyboard/script.js': ('nativeActivity()', 2),
             'touchpad/fitts-law.js': ("'touchpad_targeting'", 1),
             'touchpad/scripts_dc.js': ("'touchpad_scrolling'", 1)}
    for name, (argument, count) in hooks.items():
        source = (DEV / name).read_text()
        pattern = (r'^[ \t]*// BEGIN POST-TASK FEEDBACK HOOK\n'
                   r'[ \t]*if \(window\.SurfaceInputsFeedback\) window\.SurfaceInputsFeedback\.complete\('
                   + re.escape(argument) + r'\);\n[ \t]*// END POST-TASK FEEDBACK HOOK\n')
        original, removed = re.subn(pattern, '', source, flags=re.MULTILINE)
        assert removed == count, (name, 'Unexpected feedback completion hooks')
        baseline, baseline_removed = re.subn(pattern, '', (PROD / name).read_text(), flags=re.MULTILINE)
        assert baseline_removed in (0, count), (name, 'Unexpected production feedback hooks')
        if name == 'keyboard/script.js':
            new_url = 'https://docs.google.com/forms/d/e/1FAIpQLSfEcRfQeisYOj7K3Z1rWrbPji4rV4_9EqDlMEL4SyJi45FtRA/formResponse'
            old_url = 'https://docs.google.com/forms/d/e/1FAIpQLSdAuVaWh53BvFkNTSHVki0QqIlw7CQn-xTptVpmRtHrk2ULEA/formResponse'
            assert original.count(new_url) == 1, 'Unexpected typing URL-only override'
            assert baseline.count(new_url) in (0, 1), 'Unexpected production typing override'
            original = original.replace(new_url, old_url)
            baseline = baseline.replace(new_url, old_url)
        assert original == baseline, (name, 'Task engine changed outside completion hooks and the typing URL override')
    assert not (DEV / 'dev-bootstrap.js').exists()
    assert not (ROOT / 'development-tools').exists()
    assert (DEV / 'touchpad/arcade-targeting.css').is_file()
    for doc in ('AGENTS.md', 'README.md', 'DEPLOYMENT.md'):
        text = (ROOT / doc).read_text()
        assert 'surface-inputs-dev/' in text and 'surface-inputs/' in text
    result = subprocess.run(['python3', 'scripts/sync-dev.py'], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode != 0 and 'Dev already exists' in result.stderr
    print('10 dev entry points retain environment-local assets; collection code and task engines unchanged except explicit post-task feedback hooks.')
    if args.allow_production_changes:
        print('Owner-authorized promotion: production/runtime parity verified; jvision unchanged.')
    else:
        print('Development labeling and non-overwrite sync behavior verified. Production diff is empty.')
    print('No task was run and no telemetry or Google Form request was sent by this check.')


if __name__ == '__main__':
    main()
