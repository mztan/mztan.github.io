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
    for name in ('touchpad/event-logger.js',):
        assert (DEV / name).read_bytes() == (PROD / name).read_bytes(), (name, 'Collection code changed')
    # The only transport UI difference keeps explicit Forms identity controls in marked pages.
    def identity_ui(source):
        return re.sub(r'\s+','',re.sub(r'^\s*if\(win.document.documentElement.*data-task-forms.*return;\n','\n',source,flags=re.MULTILINE))
    assert identity_ui((DEV/'transport-ui.js').read_text())==identity_ui((PROD/'transport-ui.js').read_text()), 'Unexpected transport UI change'
    subprocess.run(['node', 'surface-inputs-dev/tests/generate-contract.js', '--check'], cwd=ROOT, check=True)
    # SDK is intentionally dev-only; standard fields stay equal to the installed v1 producer contract.
    subprocess.run(['node', '-e', "require('node:assert/strict').deepEqual(require('./surface-inputs-dev/transport.js').metrics, require('./surface-inputs/transport.js').metrics)"], cwd=ROOT, check=True)
    assert not (DEV / 'collector-config.js').exists() and not (DEV / 'form-collector.js').exists(), 'Dormant Forms collector must remain isolated'
    hooks = {'keyboard/script.js': 2, 'touchpad/fitts-law.js': 1, 'touchpad/scripts_dc.js': 1}
    for name, count in hooks.items():
        source = (DEV / name).read_text()
        assert source.count('// BEGIN POST-TASK FEEDBACK HOOK') == count, (name, 'Unexpected completion hooks')
    for name in ('metrics.js', 'keyboard-capture.js', 'keyboard/keyboard-layout.js'):
        assert (DEV / name).read_bytes() == (PROD / name).read_bytes(), (name, 'Standard calculation/capture changed')
    # Native facade wiring is intentional; browser Form submitters and fixed calculators are
    # checked separately so this verifier does not bless a global engine-byte replacement.
    def section(text, start, end):
        first = text.index(start)
        return text[first:text.index(end, first)]
    def clean(source):
        source=source.replace('function calculatePromptResult(publish = true)', 'function calculatePromptResult()').replace('if(publish)document.dispatchEvent(promptFinishedEvent);','document.dispatchEvent(promptFinishedEvent);')
        source=re.sub(r'^[ \t]*if\(?[^\n]*nativeBound\(\)[^\n]*return;\n','',source,flags=re.MULTILINE)
        source=re.sub(r'^[ \t]*if\(?[^\n]*SurfaceInputsTransport\.usesNative\(\)[^\n]*return;\n','',source,flags=re.MULTILINE)
        source=re.sub(r'^var targetingCompletion = null;\n','',source,flags=re.MULTILINE)
        source = re.sub(r"document.getElementById\('result_user_id'\)\.value = [^\n]*;", "document.getElementById('result_user_id').value = FORM_LABEL;", source)
        source = re.sub(r'^[ \t]*browserResultRetained = true;\n', '', source, flags=re.MULTILINE)
        source = re.sub(r'^[ \t]*if\s*\(window\.SurfaceInputsTaskUploads[^\n]*\n', '', source, flags=re.MULTILINE)
        return re.sub(r'^[ \t]*if \(dogfoodScrollAborted\) return;\n', '', source, flags=re.MULTILINE)
    keyboard, old_keyboard = clean((DEV / 'keyboard/script.js').read_text()), clean((PROD / 'keyboard/script.js').read_text())
    assert section(keyboard, '    function calculatePromptResult()', '    function calculateAverageResults()') == section(old_keyboard, '    function calculatePromptResult()', '    function calculateAverageResults()')
    assert keyboard[keyboard.index('    function submitPromptResultToGoogleForm('):] == old_keyboard[old_keyboard.index('    function submitPromptResultToGoogleForm('):]
    fitts, old_fitts = clean((DEV / 'touchpad/fitts-law.js').read_text()), clean((PROD / 'touchpad/fitts-law.js').read_text())
    assert fitts[:fitts.index('var targetingTaskContext')] == old_fitts[:old_fitts.index('var targetingTaskContext' if 'var targetingTaskContext' in old_fitts else 'function startExperience()')]
    assert fitts[fitts.index('function submitForm('):] == old_fitts[old_fitts.index('function submitForm('):]
    scroll, old_scroll = clean((DEV / 'touchpad/scripts_dc.js').read_text()), clean((PROD / 'touchpad/scripts_dc.js').read_text())
    assert scroll[scroll.index('function startTimer()'):] == old_scroll[old_scroll.index('function startTimer()'):]
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
