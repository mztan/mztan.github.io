'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const environment = process.env.TASK_INSTRUCTIONS_ENV || 'surface-inputs-dev';
assert(['surface-inputs-dev', 'surface-inputs'].includes(environment));
const root = path.join(__dirname, '..', environment);
const cases = [
  {
    file: 'touchpad/index.html',
    opening: '<p class="arcade-instruction">',
    text: 'For this task, click the red circles as they light up. Try to click them as fast as possible without sacrificing accuracy.',
  },
  {
    file: 'touchpad/scroll.html',
    opening: '<p id="start-explanation" class="arcade-instruction">',
    text: 'For this task, scroll the page to the yellow highlighted text to put it inside the purple area. Keep the cursor over the page for scrolling to work. Try to complete the task as fast as possible without sacrificing accuracy.',
  },
  {
    file: 'keyboard/index.html',
    opening: '<p class="instructions">',
    text: 'For this task, copy the prompt as quickly as you can without sacrificing accuracy.',
  },
];

for (const item of cases) {
  test(`${environment}: ${item.file} has the exact instruction before its task controls`, () => {
    const html = fs.readFileSync(path.join(root, item.file), 'utf8');
    const start = html.indexOf(item.opening);
    assert(start > html.indexOf('</h1>'));
    assert(start < html.indexOf('id="start-button"'));
    const text = html.slice(start + item.opening.length, html.indexOf('</p>', start));
    assert.equal(text, item.text);
    assert(!item.opening.includes('hidden'));
    assert(!item.opening.includes('display: none'));
  });
}

test(`${environment}: dynamic scrolling setup keeps the same exact instruction`, () => {
  const html = fs.readFileSync(path.join(root, 'touchpad/scroll.html'), 'utf8');
  assert(html.includes(`const EXPLANATION = '${cases[1].text}';`));
  assert(html.includes('setExperienceTitle(EXPERIENCE_NAME, EXPLANATION);'));
  assert(html.includes('arcade-scroll.css?v=task-instructions-1'));
  const css = fs.readFileSync(path.join(root, 'touchpad/arcade-scroll.css'), 'utf8');
  const rule = css.match(/#start-explanation\.arcade-instruction\s*\{([^}]+)\}/);
  assert(rule);
  assert(rule[1].includes('width: auto'));
  assert(rule[1].includes('font-weight: 400'));
});

test(`${environment}: typing area width is independent of setup-copy length`, () => {
  const html = fs.readFileSync(path.join(root, 'keyboard/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'keyboard/arcade-typing.css'), 'utf8');
  assert(html.includes('arcade-typing.css?v=task-instructions-1'));
  assert(css.includes('.container { align-self: stretch; }'));
});

test(`${environment}: guided setup and text-typing mode do not hide or replace the instruction`, () => {
  const css = fs.readFileSync(path.join(root, 'dogfood-flow.css'), 'utf8');
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (/instructions|arcade-instruction|start-explanation/.test(rule[1])) {
      assert(!/display\s*:\s*none|visibility\s*:\s*hidden/.test(rule[2]));
    }
  }
  const script = fs.readFileSync(path.join(root, 'keyboard/script.js'), 'utf8');
  assert(script.includes("const DEFAULT_INSTRUCTIONS = document.querySelector('.instructions').textContent;"));
  assert(script.includes('if (instructions) instructions.textContent = DEFAULT_INSTRUCTIONS;'));
  assert(!/instructions\.style\.(display|visibility)\s*=\s*['"](?:none|hidden)/.test(script));
});
