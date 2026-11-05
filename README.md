# change-understanding-quiz-skill

PR作成前に、今回の変更を本人が根拠付きで説明できるか確認するCodex desktop向けスキルです。本人の予想を聞き、仕様・実装の前提と別案・検証の根拠と限界・出荷判断をクイズにします。全問正解してからPR作成へ進みます。

[クイズで理解を確かめる発想元の投稿](https://x.com/fujikenbotebote/status/2117933646766379469)と、[Addy Osmaniの「Critical thinking when agents do the work」](https://x.com/addyosmani/status/2117512471930167377)をもとにしています。AIへ作業を任せても、判断の根拠を自分で説明できる状態を保つためのスキルです。

## 使い方

スキル名・リポジトリ名は `change-understanding-quiz-skill`、表示名は「変更理解クイズ」です。

```text
$change-understanding-quiz-skill 今回の変更について理解クイズを出して、合格後にPRを作ってください。
```

解説前に本人の予想と疑問を聞き、通常4〜6問を出題します。実装前から利用していれば着手前の仮説も確認します。PR直前に始めた場合は、その時点の予想として扱います。

AIの案と同じ結論を答える必要はありません。根拠を持った反論や、未確認事項を踏まえた判断も受け入れます。誤答には解説して別の例で再出題し、回答待ちの間はドラフトを含むPR作成を保留します。追加検証が必要と分かった場合は、先にその確認を行います。

合格は出題時のHEAD、作業ブランチ、比較先ブランチに結び付けます。変更はコミット済みで、作業ツリーがクリーンな状態で受験します。コードや比較先が変わった場合は再受験します。旧バージョンの合格記録も再受験になります。

## 実行環境と依存

macOSのCodex desktopローカルセッションで検証しています。`scripts/run.sh` は、環境変数 `CODEX_MCP_NODE_PATH` が指す同梱Node.jsを使います。Python、ユーザーが別途入れたNode.js、npmパッケージは必要ありません。スクリプトはNode.jsの標準機能だけで動作します。

Gitと、PR操作に使う認証済みのGitHub CLIは引き続き必要です。ランチャーはこれらを自動インストールしません。クイズ用の追加ランタイムやパッケージを導入する手順はありません。

`CODEX_MCP_NODE_PATH` はこの環境で確認した参照方法です。すべてのCodexバージョン・実行環境での提供を保証する公開仕様は確認できていません。参照がない環境では明示的なエラーにし、外部ランタイムへの切り替えや自動ダウンロードは行いません。Windowsと単体CLIは動作確認の対象外です。

## 配布内容と導入

- `skills/change-understanding-quiz-skill/`: スキル本体、UIメタデータ、同梱Node.js用ランチャーと合格記録スクリプト。
- `hooks/hooks.json`: セッション開始時の案内と、PR作成前の合格確認。
- `plugin.json`: スキルとフックをまとめて配布する定義。

cloneしただけでは有効になりません。スキル単体を導入する場合は、`skills/change-understanding-quiz-skill/` をCodexのスキル検出先（個人用の `~/.agents/skills/` またはプロジェクトの `.agents/skills/`）に配置します。この場合は会話上でPR作成を保留します。

フックも使う場合は、リポジトリ全体を手動導入可能なCodex desktop用プラグインとして扱います。フックのコマンドは `PLUGIN_ROOT` からランチャーを読み込みます。

または、`~/.codex/hooks.json` / `<対象repo>/.codex/hooks.json` にイベント定義を追加し、2か所の `command` を次のようにclone先の絶対パスへ置き換えます。既存フックがある場合はイベントごとに追記します。

```json
"command": "sh \"/absolute/path/change-understanding-quiz-skill/skills/change-understanding-quiz-skill/scripts/run.sh\" hook"
```

非管理フックには信頼の確認が必要です。デスクトップのフック確認画面やCLIの `/hooks` から内容を確認してください。読み込みと信頼の確認後、対象repoで未受験の `gh pr create --base main` が拒否されることを確認します。[公式のフック設定と信頼の説明](https://learn.chatgpt.com/docs/hooks)

## フックの対象と制限

`PreToolUse` で通常の `gh pr create --base <branch>` を検知し、有効な合格記録を確認します。対象repoの作業ディレクトリから、現在のブランチに対して実行してください。`--repo` / `--head`、変数展開や複合シェルコマンドは受け付けません。GitHub MCPの `create_pull_request` はCLIを使うよう案内して止めます。

比較先は同名の `origin/<branch>` を優先し、なければローカルブランチを参照します。受験前とPR作成前にリモート情報を更新してください。`origin` と異なるリポジトリへのfork PRには対応していません。

フックは学習のためのガードです。GitHub側の必須チェックではなく、ブラウザ操作、別プロセス、別名や動的に組み立てたコマンドを網羅するものではありません。静的検知のため、PR作成コマンドを文字列として含む別のコマンドも止まることがあります。フックの実行失敗が常にPR作成を止めるとは限らないため、利用先で有効性を確認してください。

合格記録は対象worktreeのGit管理ディレクトリ内 `change-understanding-quiz-skill/pass.json` に保存します。記録はローカルJSONで、採点はCodexが行うため、改ざん耐性や採点の正しさは保証しません。合格は変更の安全性を証明するものではありません。回答をPR本文へ自動掲載する処理はありませんが、会話の回答はCodexで処理されます。PR作成やpushには、それぞれの承認ルールが適用されます。

[公式のプラグイン内フック仕様](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)では、フック入りプラグインは手動導入向けです。利用先のフック対応状況と信頼状態を確認してください。

## 開発時の検証

Codex desktopのローカルセッションで実行します。

```sh
"$CODEX_MCP_NODE_PATH" --test tests/gate.test.cjs
```

一時Gitリポジトリで、本人の予想と4区分の回答から合格を保存し、PR作成フックが合格を確認する流れと、変更後の再受験を検証します。同梱Node.jsの絶対パスと、Gitだけを置いたPATHでもランチャーを動かします。
