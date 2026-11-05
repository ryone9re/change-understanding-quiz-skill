# skill-marketplace-work

Codex desktop向けスキルをプラグインとして配布するマーケットプレイスです。現在は「変更理解クイズ」を収録しています。PR作成前に本人の予想を聞き、仕様・実装の前提と別案・検証の根拠と限界・出荷判断を確認し、全問正解してからPR作成へ進みます。

[クイズで理解を確かめる発想元の投稿](https://x.com/fujikenbotebote/status/2117933646766379469)と、[Addy Osmaniの「Critical thinking when agents do the work」](https://x.com/addyosmani/status/2117512471930167377)をもとにしています。AIへ作業を任せても、判断の根拠を自分で説明できる状態を保つためのスキルです。

## 使い方

マーケットプレイス名は `skill-marketplace-work`、収録プラグインとスキルの名前は `change-understanding-quiz-skill`、表示名は「変更理解クイズ」です。

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

## マーケットプレイスからのインストール

1. Codex desktopのプラグイン画面でマーケットプレイスの追加を開き、次のGitHub URLを指定します。

   ```text
   https://github.com/ryone9re/skill-marketplace-work
   ```

2. `skill-marketplace-work` を選び、「変更理解クイズ」をインストールします。スキルとフックが同じプラグインに含まれています。
3. フックの確認画面で内容を確認して信頼し、新しいチャットでスキルを使います。インストールだけではフックは実行されません。

CLIから追加・インストールする場合は、次を実行します。

```sh
codex plugin marketplace add ryone9re/skill-marketplace-work
codex plugin add change-understanding-quiz-skill@skill-marketplace-work
```

マーケットプレイスの追加は、プラグインのインストールとは別の操作です。後で一覧から選んで導入することもできます。フックの信頼はデスクトップのフック確認画面、またはCLIの `/hooks` で確認できます。フックの実行には前述のCodex desktopの同梱Node.jsを使います。単体CLIでスキルをインストールしても、このランタイム条件は変わりません。

[公式のマーケットプレイス仕様](https://developers.openai.com/plugins/build/plugins#marketplace-metadata)・[CLIコマンド](https://learn.chatgpt.com/docs/developer-commands)・[フックの信頼](https://learn.chatgpt.com/docs/hooks)

マーケットプレイスを更新する場合は次を実行します。デスクトップのプラグイン画面から提供される更新を適用し、フックの再確認が表示されたら内容を確認します。

```sh
codex plugin marketplace upgrade skill-marketplace-work
```

## 配布構成

- `.agents/plugins/marketplace.json`: インストール可能なプラグインのカタログ。
- `plugin.json`: 「変更理解クイズ」の表示情報とフック参照。
- `skills/change-understanding-quiz-skill/`: スキル本体、UIメタデータ、同梱Node.js用ランチャーと合格記録スクリプト。
- `hooks/hooks.json`: セッション開始時の案内と、PR作成前の合格確認。

カタログからリポジトリルートのプラグインを参照します。cloneしただけではインストールされません。スキルだけを手動配置する場合は `skills/change-understanding-quiz-skill/` をCodexのスキル検出先（個人用の `~/.agents/skills/` またはプロジェクトの `.agents/skills/`）に配置できます。この場合、フックは別途設定が必要です。

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
