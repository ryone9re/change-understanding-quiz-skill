# change-understanding-quiz-skill

PR作成前に、今回の変更の仕様と実装を理解しているかクイズで確認するCodexスキルです。本人が全問正解してからPR作成へ進みます。

[発想元の投稿](https://x.com/fujikenbotebote/status/2117933646766379469)をもとにしています。

## 使い方

スキル名・リポジトリ名は `change-understanding-quiz-skill`、表示名は「変更理解クイズ」です。

```text
$change-understanding-quiz-skill 今回の変更について理解クイズを出して、合格後にPRを作ってください。
```

通常3〜5問を出題します。仕様の具体例と技術的な理由の両方を問い、誤答には解説して別の例で再出題します。回答を待っている間はPR作成を保留します。ドラフトPRも対象です。

合格は出題時のHEAD、作業ブランチ、比較先ブランチに結び付けます。変更はコミット済みで、作業ツリーがクリーンな状態で受験します。コミットや比較先が変わった場合は再受験します。

## 配布内容

- `skills/change-understanding-quiz-skill/`: スキル本体、UIメタデータ、合格記録スクリプト。
- `hooks/hooks.json`: セッション開始時の案内と、PR作成前の合格確認。
- `plugin.json`: スキルとフックをまとめて配布するための定義。

このリポジトリをcloneしただけでは、スキルやフックは有効になりません。

## スキルを使う場合

将来導入する際は、`skills/change-understanding-quiz-skill/` をCodexのスキル検出先（個人用の `~/.agents/skills/` またはプロジェクトの `.agents/skills/`）に配置します。Python 3.10以上、Git、GitHub CLIが必要です。スキル単体ではPR作成を会話上で制限します。

## フックも使う場合

フックを含める場合は、リポジトリ全体を手動導入可能なCodexデスクトップ用プラグインとして扱います。`plugin.json` が `hooks/hooks.json` を参照し、コマンドはCodexが設定する `PLUGIN_ROOT` からスクリプトを読み込みます。

または、対応するCodex環境の `~/.codex/hooks.json` / `<対象repo>/.codex/hooks.json` にイベント定義を追加し、2か所の `command` を次のようにclone先の絶対パスへ置き換えます。既存フックがある場合はイベントごとに追記します。

```json
"command": "python3 \"/absolute/path/change-understanding-quiz-skill/skills/change-understanding-quiz-skill/scripts/gate.py\" hook"
```

非管理フックには信頼の確認が必要です。CLIでは `/hooks` から内容を確認できます。フックを読み込んで信頼した後、対象repoで未受験の `gh pr create --base main` が拒否されることを確認してください。[公式のフック設定と信頼の説明](https://learn.chatgpt.com/docs/hooks)

## フックの対象と制限

`PreToolUse` で通常の `gh pr create --base <branch>` を検知し、有効な合格記録を確認します。対象repoの作業ディレクトリから、現在のブランチに対して実行してください。`--repo` / `--head` や複合シェルコマンドは受け付けません。GitHub MCPの `create_pull_request` はCLIを使うよう案内して止めます。

比較先は同名の `origin/<branch>` を優先し、なければローカルブランチを参照します。受験前とPR作成前にリモート情報を更新してください。`origin` と異なるリポジトリへのfork PRには対応していません。

このフックは学習のためのガードです。GitHub側の必須チェックではなく、ブラウザ操作、別プロセス、別名や動的に組み立てたコマンドを網羅して止めるものではありません。合格記録はローカルJSONで、採点はCodexが行うため、改ざん耐性や採点の正しさは保証しません。静的検知のため、PR作成コマンドを文字列として含む別のコマンドも止まることがあります。

回答記録は対象worktreeのGit管理ディレクトリ内 `change-understanding-quiz-skill/pass.json` に保存します。回答はGitHubへ送信しません。PR作成やpushには、それぞれの承認ルールが適用されます。

[公式のプラグイン内フック仕様](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)では、フック入りプラグインは手動導入向けです。利用先のフック対応状況と信頼状態を確認してください。

## 開発時の検証

```sh
python3 -m unittest discover -s tests -v
```

一時Gitリポジトリを作り、回答記録から合格を保存してPR作成フックを通過する流れと、変更後の再受験を検証します。GitHubへのPRは作成しません。
