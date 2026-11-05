#!/usr/bin/env python3
"""Local learning gate; grading remains the agent's responsibility."""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys


def git(cwd, *args):
    return subprocess.check_output(
        ['git', '-C', str(cwd), *args], stderr=subprocess.PIPE, text=True
    ).strip()


def snapshot(cwd, base):
    root = git(cwd, 'rev-parse', '--show-toplevel')
    if git(root, 'status', '--porcelain'):
        raise ValueError('変更をコミットしてからクイズを開始してください。')
    branch = git(root, 'symbolic-ref', '--short', 'HEAD')
    git(root, 'check-ref-format', 'refs/heads/' + base)
    base_ref = 'refs/remotes/origin/' + base
    try:
        git(root, 'rev-parse', '--verify', base_ref)
    except subprocess.CalledProcessError:
        base_ref = 'refs/heads/' + base
    return {
        'root': root,
        'branch': branch,
        'head': git(root, 'rev-parse', 'HEAD'),
        'base': base,
        'base_ref': base_ref,
        'base_tip': git(root, 'rev-parse', '--verify', base_ref + '^{commit}'),
        'merge_base': git(root, 'merge-base', 'HEAD', base_ref),
    }


def state_path(cwd):
    return Path(git(cwd, 'rev-parse', '--path-format=absolute', '--git-path', 'change-understanding-quiz-skill/pass.json'))


def record_pass(cwd, base, record):
    current = snapshot(cwd, base)
    if record.get('snapshot') != current:
        raise ValueError('出題時と変更内容が異なります。出題し直してください。')
    questions = record.get('questions')
    if not isinstance(questions, list) or len(questions) < 2:
        raise ValueError('仕様と技術の回答・採点記録が必要です。')
    categories = set()
    for q in questions:
        if not isinstance(q, dict):
            raise ValueError('問題の記録が不正です。')
        for field in ('question', 'answer', 'reason'):
            if not isinstance(q.get(field), str) or not q[field].strip():
                raise ValueError('問題・本人の回答・採点理由が必要です。')
        if q.get('correct') is not True:
            raise ValueError('全問正解してから合格を記録してください。')
        category = q.get('category')
        if category not in ('spec', 'technical'):
            raise ValueError('category は spec または technical です。')
        categories.add(category)
    if categories != {'spec', 'technical'}:
        raise ValueError('仕様と技術の両方を出題してください。')
    path = state_path(cwd)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    os.replace(temporary, path)


def check(cwd, base):
    record = json.loads(state_path(cwd).read_text())
    if record['snapshot'] != snapshot(cwd, base):
        raise ValueError('合格後にHEAD・ブランチ・比較先が変わりました。再受験してください。')
    return record


def deny(reason):
    print(json.dumps({'hookSpecificOutput': {
        'hookEventName': 'PreToolUse',
        'permissionDecision': 'deny',
        'permissionDecisionReason': '変更理解クイズ: ' + reason,
    }}, ensure_ascii=False))


def hook(event):
    if event.get('hook_event_name') == 'SessionStart':
        print(json.dumps({'hookSpecificOutput': {
            'hookEventName': 'SessionStart',
            'additionalContext': 'PR作成前に $change-understanding-quiz-skill を使い、仕様と技術のクイズに本人が全問正解するまでPRを作成しない。作成には gh pr create --base <比較先> を使う。',
        }}, ensure_ascii=False))
        return
    name = event.get('tool_name', '')
    if 'create_pull_request' in name:
        deny('$change-understanding-quiz-skill を完了し、対象リポジトリの作業ディレクトリから gh pr create --base <比較先> を使ってください。')
        return
    command = event.get('tool_input', {}).get('command', '')
    if not isinstance(command, str):
        return
    # shortcut: 静的なghコマンドだけを検知する。別名や動的生成を扱うなら専用の実行基盤へ移す。
    if not all(word in command for word in ('gh', 'pr', 'create')):
        return
    try:
        tokens = shlex.split(command)
        if len(tokens) < 3 or Path(tokens[0]).name != 'gh' or tokens[1:3] != ['pr', 'create']:
            raise ValueError('PR作成は単独の gh pr create コマンドで実行してください。workdir でリポジトリを指定してください。')
        if '\n' in command or any(t in (';', '&&', '||', '|', '&', '>', '>>', '<') for t in tokens):
            raise ValueError('PR作成はシェルの複合処理と分けて実行してください。')
        if any(t in ('-R', '--repo', '-H', '--head') or t.startswith(('--repo=', '--head=', '-R', '-H')) for t in tokens[3:]):
            raise ValueError('--repo/--head は使わず、対象リポジトリの現在のブランチから作成してください。')
        base = None
        for index, token in enumerate(tokens[3:], 3):
            if token in ('--base', '-B'):
                base = tokens[index + 1]
            elif token.startswith('--base='):
                base = token.split('=', 1)[1]
        if not base:
            raise ValueError('クイズと同じ比較先を --base で指定してください。')
        check(event['cwd'], base)
        print(json.dumps({'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'additionalContext': '変更理解クイズは全問正解済みです。既存の承認ルールに従ってPRを作成してください。',
        }}, ensure_ascii=False))
    except (ValueError, OSError, KeyError, IndexError, subprocess.CalledProcessError) as error:
        deny('有効な合格記録を確認できません。$change-understanding-quiz-skill を実行してください。 ' + str(error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['snapshot', 'pass', 'check', 'hook'])
    parser.add_argument('--base')
    parser.add_argument('--record', type=Path)
    args = parser.parse_args()
    if args.action == 'hook':
        hook(json.load(sys.stdin))
        return
    if not args.base:
        parser.error('--base is required')
    cwd = Path.cwd()
    if args.action == 'snapshot':
        print(json.dumps(snapshot(cwd, args.base), ensure_ascii=False, indent=2))
    elif args.action == 'pass':
        if not args.record:
            parser.error('--record is required')
        record_pass(cwd, args.base, json.loads(args.record.read_text()))
        print('全問正解を記録しました。')
    else:
        check(cwd, args.base)
        print('現在の変更について合格済みです。')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        print('変更理解クイズ: ' + str(error), file=sys.stderr)
        sys.exit(1)
