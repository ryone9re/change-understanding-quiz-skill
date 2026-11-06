const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const categories = ['spec', 'technical'];
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const emit = output => console.log(JSON.stringify(output));

// shortcut: 文書はファイル名で判定する。プロジェクト固有の分類が必要になったら属性で指定する。
function isDocumentation(file) {
  return /\.(?:md|markdown|mdx|rst|adoc|asciidoc|org)$/i.test(file)
    || /^(?:readme|changelog|license|copying|contributing|authors|notice)(?:\.txt)?$/i.test(path.basename(file))
    || /^(?:docs?|documentation)\/.+\.txt$/i.test(file);
}

function snapshot(cwd, base) {
  const root = git(cwd, 'rev-parse', '--show-toplevel');
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  git(root, 'check-ref-format', `refs/heads/${base}`);
  let baseRef = `refs/remotes/origin/${base}`;
  try { git(root, 'rev-parse', '--verify', baseRef); }
  catch { baseRef = `refs/heads/${base}`; }
  const head = git(root, 'rev-parse', 'HEAD');
  const baseTip = git(root, 'rev-parse', '--verify', `${baseRef}^{commit}`);
  const mergeBase = git(root, 'merge-base', head, baseTip);
  const changes = git(root, 'diff', '--name-status', '-z', '--no-renames', mergeBase, head, '--').split('\0');
  const implementationPaths = changes.filter((file, i) => i % 2 === 1 && !isDocumentation(file));
  if (implementationPaths.length && git(root, 'status', '--porcelain')) {
    throw new Error('変更をコミットしてからクイズを開始してください。');
  }
  return { root, branch, head, base, base_ref: baseRef, base_tip: baseTip, merge_base: mergeBase, implementation_paths: implementationPaths };
}

function statePath(cwd) {
  // 改名前の合格記録を引き続き使うため、保存先は維持する。
  return git(cwd, 'rev-parse', '--path-format=absolute', '--git-path', 'change-understanding-quiz-skill/pass.json');
}

function validateRecord(record) {
  if (record?.version !== 3) throw new Error('現行の理解確認で再受験してください。');
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
    throw new Error('実装の挙動と処理の仕組みの両方を確認してください。');
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
  const current = snapshot(cwd, base);
  if (!current.implementation_paths.length) return null;
  const record = readJson(statePath(cwd));
  validateRecord(record);
  if (!isDeepStrictEqual(record.snapshot, current)) throw new Error('合格後にHEAD・ブランチ・比較先が変わりました。再受験してください。');
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
    emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: '実装を含むPRの作成前に $change-understanding-quiz で、PRを出す開発者が今回の実装の挙動と処理を説明できるか確認する。文書だけのPRはクイズを省略する。gh pr create --base <比較先> を使う。' } });
    return;
  }
  if (event.tool_name?.includes('create_pull_request')) {
    deny('差分の確認のため、対象リポジトリから gh pr create --base <比較先> を使ってください。');
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
    const record = check(event.cwd, base);
    const message = record ? '変更理解クイズは全問正解済みです。' : '実装差分がないためクイズは対象外です。';
    emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message + '既存の承認ルールに従ってPRを作成してください。' } });
  } catch (error) {
    deny('有効な合格記録を確認できません。$change-understanding-quiz を実行してください。 ' + error.message);
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
    const record = check(process.cwd(), values.base);
    console.log(record ? '現在の変更について合格済みです。' : '実装差分がないためクイズは対象外です。');
  } else throw new Error('action must be snapshot, pass, check, or hook');
}

module.exports = { snapshot, recordPass, check, hook };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('変更理解クイズ: ' + error.message); process.exitCode = 1; }
}
