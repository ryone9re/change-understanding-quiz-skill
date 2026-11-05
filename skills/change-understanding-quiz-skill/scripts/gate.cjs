const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const categories = ['spec', 'technical', 'verification', 'judgment'];
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const emit = output => console.log(JSON.stringify(output));

function snapshot(cwd, base) {
  const root = git(cwd, 'rev-parse', '--show-toplevel');
  if (git(root, 'status', '--porcelain')) throw new Error('変更をコミットしてからクイズを開始してください。');
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  git(root, 'check-ref-format', `refs/heads/${base}`);
  let baseRef = `refs/remotes/origin/${base}`;
  try { git(root, 'rev-parse', '--verify', baseRef); }
  catch { baseRef = `refs/heads/${base}`; }
  return {
    root, branch, head: git(root, 'rev-parse', 'HEAD'), base, base_ref: baseRef,
    base_tip: git(root, 'rev-parse', '--verify', `${baseRef}^{commit}`),
    merge_base: git(root, 'merge-base', 'HEAD', baseRef),
  };
}

function statePath(cwd) {
  return git(cwd, 'rev-parse', '--path-format=absolute', '--git-path', 'change-understanding-quiz-skill/pass.json');
}

function validateRecord(record) {
  if (record?.version !== 2) throw new Error('現行の理解確認で再受験してください。');
  if (typeof record.initial_thoughts !== 'string' || !record.initial_thoughts.trim()) {
    throw new Error('説明を読む前の本人の予想・疑問を記録してください。');
  }
  if (!Array.isArray(record.questions)) throw new Error('回答・採点記録が必要です。');
  const covered = new Set();
  for (const question of record.questions) {
    if (!question || !categories.includes(question.category)) throw new Error('出題区分が不正です。');
    for (const field of ['question', 'answer', 'reason']) {
      if (typeof question[field] !== 'string' || !question[field].trim()) throw new Error('問題・本人の回答・採点理由が必要です。');
    }
    if (question.correct !== true) throw new Error('全問正解してから合格を記録してください。');
    covered.add(question.category);
  }
  if (!categories.every(category => covered.has(category))) {
    throw new Error('仕様・技術・検証の根拠と限界・出荷判断のすべてを確認してください。');
  }
}

function recordPass(cwd, base, record) {
  validateRecord(record);
  if (!isDeepStrictEqual(record.snapshot, snapshot(cwd, base))) throw new Error('出題時と変更内容が異なります。出題し直してください。');
  const file = statePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function check(cwd, base) {
  const record = readJson(statePath(cwd));
  validateRecord(record);
  if (!isDeepStrictEqual(record.snapshot, snapshot(cwd, base))) throw new Error('合格後にHEAD・ブランチ・比較先が変わりました。再受験してください。');
  return record;
}

// shortcut: 単独の静的なghコマンドだけを扱う。別名や動的生成を強制するなら専用の実行基盤へ移す。
function commandTokens(command) {
  if (command.includes('\n')) throw new Error('PR作成は単独コマンドで実行してください。');
  const tokens = [];
  let token = '', quote = '', started = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote === "'") {
      if (char === "'") quote = ''; else token += char;
    } else if (char === '\\') {
      if (++i === command.length) throw new Error('コマンドの末尾が不正です。');
      const next = command[i];
      token += quote === '"' && !['$', '`', '"', '\\'].includes(next) ? '\\' + next : next;
      started = true;
    } else if (char === '$' || char === '`') {
      throw new Error('PR作成コマンドの変数展開・動的生成には対応していません。');
    } else if (quote === '"') {
      if (char === '"') quote = ''; else token += char;
    } else if (char === '"' || char === "'") {
      quote = char; started = true;
    } else if (/\s/.test(char)) {
      if (started) tokens.push(token);
      token = ''; started = false;
    } else {
      if (';&|<>()'.includes(char)) throw new Error('PR作成はシェルの複合処理と分けて実行してください。');
      token += char; started = true;
    }
  }
  if (quote) throw new Error('コマンドの引用符が閉じていません。');
  if (started) tokens.push(token);
  return tokens;
}

function deny(reason) {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '変更理解クイズ: ' + reason } });
}

function hook(event) {
  if (event.hook_event_name === 'SessionStart') {
    emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'PR作成前に $change-understanding-quiz-skill を使う。本人の予想を聞き、仕様・前提と別案・検証の根拠と限界・出荷判断を本人が説明できるまでPR作成を保留する。gh pr create --base <比較先> を使う。' } });
    return;
  }
  if (event.tool_name?.includes('create_pull_request')) {
    deny('$change-understanding-quiz-skill を完了し、対象リポジトリから gh pr create --base <比較先> を使ってください。');
    return;
  }
  const command = event.tool_input?.command;
  if (typeof command !== 'string' || !['gh', 'pr', 'create'].every(word => command.includes(word))) return;
  try {
    const tokens = commandTokens(command);
    if (path.basename(tokens[0] || '') !== 'gh' || tokens[1] !== 'pr' || tokens[2] !== 'create') {
      throw new Error('PR作成は単独の gh pr create で実行し、workdirでリポジトリを指定してください。');
    }
    if (tokens.slice(3).some(token => /^(-R|-H|--repo(?:=|$)|--head(?:=|$))/.test(token))) {
      throw new Error('--repo/--head は使わず、対象リポジトリの現在のブランチから作成してください。');
    }
    let base;
    for (let i = 3; i < tokens.length; i++) {
      if (tokens[i] === '--base' || tokens[i] === '-B') base = tokens[++i];
      else if (tokens[i].startsWith('--base=')) base = tokens[i].slice(7);
    }
    if (!base) throw new Error('クイズと同じ比較先を --base で指定してください。');
    check(event.cwd, base);
    emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: '変更理解クイズは全問正解済みです。既存の承認ルールに従ってPRを作成してください。' } });
  } catch (error) {
    deny('有効な合格記録を確認できません。$change-understanding-quiz-skill を実行してください。 ' + error.message);
  }
}

function main(args) {
  const [action, ...options] = args;
  if (action === 'hook') return hook(readJson(0));
  const { parseArgs } = require('node:util');
  const { values } = parseArgs({ args: options, options: { base: { type: 'string' }, record: { type: 'string' } } });
  if (!values.base) throw new Error('--base is required');
  if (action === 'snapshot') emit(snapshot(process.cwd(), values.base));
  else if (action === 'pass') {
    if (!values.record) throw new Error('--record is required');
    recordPass(process.cwd(), values.base, readJson(values.record));
    console.log('全問正解を記録しました。');
  } else if (action === 'check') {
    check(process.cwd(), values.base);
    console.log('現在の変更について合格済みです。');
  } else throw new Error('action must be snapshot, pass, check, or hook');
}

module.exports = { snapshot, recordPass, check, hook };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('変更理解クイズ: ' + error.message); process.exitCode = 1; }
}
