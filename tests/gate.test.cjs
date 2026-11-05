const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const gate = require('../skills/change-understanding-quiz/scripts/gate.cjs');
const launcher = path.resolve(__dirname, '../skills/change-understanding-quiz/scripts/run.sh');

function repository(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'understanding quiz '));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Quiz Test');
  git('config', 'user.email', 'quiz@example.invalid');
  function commit(value) {
    fs.writeFileSync(path.join(cwd, 'behavior.txt'), value);
    git('add', 'behavior.txt'); git('commit', '-m', value);
  }
  commit('before'); git('switch', '-c', 'feature'); commit('after');
  const record = () => ({ version: 2, snapshot: gate.snapshot(cwd, 'main'), initial_thoughts: 'I expect the file to change the result, but need to check callers.', questions: [
    { category: 'spec', question: 'What result changes?', answer: 'after', correct: true, reason: 'behavior.txt changes the result' },
    { category: 'technical', question: 'What assumption does this rely on?', answer: 'The caller reads behavior.txt; changing the caller is another option.', correct: true, reason: 'The call path uses this file.' },
    { category: 'verification', question: 'What does the check establish and miss?', answer: 'The content changed; concurrent reads are untested.', correct: true, reason: 'The diff checks content only.' },
    { category: 'judgment', question: 'Why can this be submitted?', answer: 'It meets the requested content change; concurrency review remains a reviewer question.', correct: true, reason: 'Reasoned scope and uncertainty are explicit.' },
  ] });
  function invoke(command, env = process.env) {
    const event = { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } };
    return JSON.parse(execFileSync('/bin/sh', [launcher, 'hook'], { input: JSON.stringify(event), encoding: 'utf8', env }));
  }
  return { cwd, git, commit, record, invoke };
}

const denied = result => assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
const passed = result => assert.match(result.hookSpecificOutput.additionalContext, /全問正解済み/);

test('quiz record, bundled launcher, and quoted PR command', t => {
  const repo = repository(t);
  denied(repo.invoke('gh pr create --base main'));
  const record = repo.record();
  const recordFile = path.join(repo.cwd, '.git', 'answers.json');
  fs.writeFileSync(recordFile, JSON.stringify(record));
  const snapshot = JSON.parse(execFileSync('/bin/sh', [launcher, 'snapshot', '--base', 'main'], { cwd: repo.cwd, encoding: 'utf8' }));
  assert.deepEqual(snapshot, record.snapshot);
  assert.match(execFileSync('/bin/sh', [launcher, 'pass', '--base', 'main', '--record', recordFile], { cwd: repo.cwd, encoding: 'utf8' }), /全問正解を記録/);
  assert.match(execFileSync('/bin/sh', [launcher, 'check', '--base', 'main'], { cwd: repo.cwd, encoding: 'utf8' }), /合格済み/);
  passed(repo.invoke('gh pr create --base main --title "Change result" --body \'A; B & $5\''));
  assert.deepEqual(gate.check(repo.cwd, 'main'), record);
});

test('wrong answers require retry and all understanding areas', t => {
  const repo = repository(t);
  const record = repo.record();
  record.questions[0].correct = false;
  assert.throws(() => gate.recordPass(repo.cwd, 'main', record), /全問正解/);
  record.questions[0].correct = true;
  const judgment = record.questions.pop();
  assert.throws(() => gate.recordPass(repo.cwd, 'main', record), /すべて/);
  record.questions.push(judgment);
  gate.recordPass(repo.cwd, 'main', record);
  passed(repo.invoke('gh pr create --base=main --draft'));
});

test('initial thoughts must be recorded before a pass', t => {
  const repo = repository(t), record = repo.record();
  record.initial_thoughts = '';
  assert.throws(() => gate.recordPass(repo.cwd, 'main', record), /予想・疑問/);
  record.initial_thoughts = 'I do not know the caller yet; I expect the changed file to affect its output.';
  gate.recordPass(repo.cwd, 'main', record);
  passed(repo.invoke('gh pr create --base main'));
});

test('working tree and committed changes require a new quiz', t => {
  const repo = repository(t), record = repo.record();
  gate.recordPass(repo.cwd, 'main', record);
  fs.writeFileSync(path.join(repo.cwd, 'behavior.txt'), 'third');
  denied(repo.invoke('gh pr create --base main'));
  repo.commit('third');
  assert.throws(() => gate.recordPass(repo.cwd, 'main', record), /出題時/);
  gate.recordPass(repo.cwd, 'main', repo.record());
  passed(repo.invoke('gh pr create --base main'));
});

test('remote base updates require a new quiz', t => {
  const repo = repository(t);
  repo.git('update-ref', 'refs/remotes/origin/main', repo.git('rev-parse', 'main'));
  gate.recordPass(repo.cwd, 'main', repo.record());
  repo.git('update-ref', 'refs/remotes/origin/main', repo.git('rev-parse', 'HEAD'));
  denied(repo.invoke('gh pr create --base main'));
});

test('creation target and shell context must match the quiz', t => {
  const repo = repository(t);
  gate.recordPass(repo.cwd, 'main', repo.record());
  for (const command of ['gh pr create', 'gh pr create --base other', 'gh pr create --base main --repo other/repo', 'gh pr create --base main --head other', 'cd ../other && gh pr create --base main', 'gh pr create --base main;echo done', 'gh pr create --base "$TARGET"']) denied(repo.invoke(command));
});

test('old pass records require the updated quiz', t => {
  const repo = repository(t), record = repo.record();
  record.version = 1;
  const file = repo.git('rev-parse', '--path-format=absolute', '--git-path', 'change-understanding-quiz-skill/pass.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record));
  denied(repo.invoke('gh pr create --base main'));
});

test('bundled runtime works with only Git on PATH', t => {
  const repo = repository(t);
  gate.recordPass(repo.cwd, 'main', repo.record());
  const bin = path.join(repo.cwd, '.git', 'test-bin'); fs.mkdirSync(bin);
  fs.symlinkSync(execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(bin, 'git'));
  passed(repo.invoke('gh pr create --base main', { ...process.env, PATH: bin }));
});

test('declared plugin hook runs through the bundled launcher', t => {
  const repo = repository(t);
  const config = require('../hooks/hooks.json');
  const command = config.hooks.PreToolUse[0].hooks[0].command;
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repo.cwd, tool_input: { command: 'gh pr create --base main' } });
  const invoke = () => JSON.parse(execFileSync('/bin/sh', ['-c', command], {
    input, encoding: 'utf8', env: { ...process.env, PLUGIN_ROOT: path.resolve(__dirname, '..') },
  }));
  denied(invoke());
  gate.recordPass(repo.cwd, 'main', repo.record());
  passed(invoke());
});

test('session reminder and MCP guidance', () => {
  const outputs = [], log = console.log;
  console.log = value => outputs.push(JSON.parse(value));
  try {
    gate.hook({ hook_event_name: 'SessionStart' });
    gate.hook({ tool_name: 'mcp__github__create_pull_request' });
  } finally { console.log = log; }
  assert.match(outputs[0].hookSpecificOutput.additionalContext, /\$change-understanding-quiz/);
  denied(outputs[1]);
});
