# skill-marketplace-work

Codex desktop向けスキルをプラグインとして配布するマーケットプレイスです。現在は「変更の理解確認」プラグインを収録しています。実装を含むPRの作成前に、開発者本人が変更後の挙動とコードの処理を説明できるか、クイズで確認します。

[クイズで理解を確かめる発想元の投稿](https://x.com/fujikenbotebote/status/2117933646766379469)と、[Addy Osmaniの「Critical thinking when agents do the work」](https://x.com/addyosmani/status/2117512471930167377)をもとにしています。AIへ作業を任せても、判断の根拠を自分で説明できる状態を保つためのスキルです。

## 使い方

| 種類 | 名前 | 表示名 |
| --- | --- | --- |
| マーケットプレイス | `skill-marketplace-work` | skill-marketplace-work |
| プラグイン | `change-understanding-check` | 変更の理解確認 |
| スキル | `change-understanding-quiz` | 変更理解クイズ |

プラグインはスキルとフックをまとめたインストール単位です。スキルは理解クイズを進める作業手順で、次のように呼び出します。

```text
$change-understanding-quiz 今回の変更について理解クイズを出して、合格後にPRを作ってください。
```

文書だけのPRはクイズを省略します。文書と実装が混在する場合は、実装差分だけを出題します。出題は変更後の挙動とコードの処理に絞ります。誤答は別の例で再出題し、全問正解後にドラフトを含むPRの作成へ進みます。

文書は、Markdown・reStructuredText・AsciiDoc・Org系の拡張子、README・CHANGELOG・LICENSEなどの慣例的な文書名、ルートの `doc/`・`docs/`・`documentation/` 配下の `.txt` で判定します。その他の差分は実装側として扱います。

合格は出題時のHEAD、作業ブランチ、比較先ブランチに結び付けます。実装を含むPRは、変更をコミットして作業ツリーがクリーンな状態で受験します。コードや比較先が変わった場合は再受験します。形式の異なる旧バージョンの合格記録は再受験になります。

## 実行環境と依存

macOSのCodex desktopローカルセッションで検証しています。`scripts/run.sh` は、環境変数 `CODEX_MCP_NODE_PATH` が指す同梱Node.jsを使います。Python、ユーザーが別途入れたNode.js、npmパッケージは必要ありません。スクリプトはNode.jsの標準機能だけで動作します。

Gitと、PR操作に使う認証済みのGitHub CLIは引き続き必要です。ランチャーはこれらを自動インストールしません。クイズ用の追加ランタイムやパッケージを導入する手順はありません。

`CODEX_MCP_NODE_PATH` はこの環境で確認した参照方法です。すべてのCodexバージョン・実行環境での提供を保証する公開仕様は確認できていません。参照がない環境では明示的なエラーにし、外部ランタイムへの切り替えや自動ダウンロードは行いません。Windowsと単体CLIは動作確認の対象外です。

## マーケットプレイスからのインストール

1. Codex desktopのプラグイン画面でマーケットプレイスの追加を開き、次のGitHub URLを指定します。

   ```text
   https://github.com/ryone9re/skill-marketplace-work
   ```

2. `skill-marketplace-work` を選び、「変更の理解確認」をインストールします。スキルとフックが同じプラグインに含まれています。
3. フックの確認画面で内容を確認して信頼し、新しいチャットでスキルを使います。インストールだけではフックは実行されません。

CLIから追加・インストールする場合は、次を実行します。

```sh
codex plugin marketplace add ryone9re/skill-marketplace-work
codex plugin add change-understanding-check@skill-marketplace-work
```

マーケットプレイスの追加は、プラグインのインストールとは別の操作です。後で一覧から選んで導入することもできます。フックの信頼はデスクトップのフック確認画面、またはCLIの `/hooks` で確認できます。フックの実行には前述のCodex desktopの同梱Node.jsを使います。単体CLIでスキルをインストールしても、このランタイム条件は変わりません。

[公式のマーケットプレイス仕様](https://developers.openai.com/plugins/build/plugins#marketplace-metadata)・[CLIコマンド](https://learn.chatgpt.com/docs/developer-commands)・[フックの信頼](https://learn.chatgpt.com/docs/hooks)

マーケットプレイスを更新する場合は次を実行します。デスクトップのプラグイン画面から提供される更新を適用し、フックの再確認が表示されたら内容を確認します。

```sh
codex plugin marketplace upgrade skill-marketplace-work
```

## 旧名からの移行

旧プラグイン `change-understanding-quiz-skill` をインストール済みの場合は、デスクトップのプラグイン画面で削除してから新しいプラグインを導入します。CLIでは次のように切り替えます。

```sh
codex plugin marketplace upgrade skill-marketplace-work
codex plugin remove change-understanding-quiz-skill@skill-marketplace-work
codex plugin add change-understanding-check@skill-marketplace-work
```

呼び出し名は `$change-understanding-quiz` になります。旧スキルを手動配置していた場合も、新しいスキルへ置き換えてください。合格記録の保存先は共通です。形式の異なる記録は再受験になります。

## 配布構成

- `.agents/plugins/marketplace.json`: インストール可能なプラグインのカタログ。
- `.codex-plugin/plugin.json`: 「変更の理解確認」プラグインの表示情報とフック参照。
- `skills/change-understanding-quiz/`: スキル本体、UIメタデータ、同梱Node.js用ランチャーと合格記録スクリプト。
- `hooks/hooks.json`: セッション開始時の案内と、PR作成前の合格確認。

カタログからリポジトリルートのプラグインを参照します。cloneしただけではインストールされません。スキルだけを手動配置する場合は `skills/change-understanding-quiz/` をCodexのスキル検出先（個人用の `~/.agents/skills/` またはプロジェクトの `.agents/skills/`）に配置できます。この場合、フックは別途設定が必要です。

## フックの対象と制限

`PreToolUse` で通常の `gh pr create --base <branch>` を検知し、実装差分がある場合に合格記録を確認します。対象repoの作業ディレクトリから、現在のブランチに対して実行してください。`--repo` / `--head`、変数展開や複合シェルコマンドは受け付けません。GitHub MCPの `create_pull_request` はCLIを使うよう案内して止めます。

比較先は同名の `origin/<branch>` を優先し、なければローカルブランチを参照します。受験前とPR作成前にリモート情報を更新してください。`origin` と異なるリポジトリへのfork PRには対応していません。

フックは学習のためのガードです。GitHub側の必須チェックではなく、ブラウザ操作、別プロセス、別名や動的に組み立てたコマンドを網羅するものではありません。静的検知のため、PR作成コマンドを文字列として含む別のコマンドも止まることがあります。フックの実行失敗が常にPR作成を止めるとは限らないため、利用先で有効性を確認してください。

合格記録は対象worktreeのGit管理ディレクトリ内 `change-understanding-quiz-skill/pass.json` に保存します。記録はローカルJSONで、採点はCodexが行うため、改ざん耐性や採点の正しさは保証しません。合格は変更の安全性を証明するものではありません。回答をPR本文へ自動掲載する処理はありませんが、会話の回答はCodexで処理されます。PR作成やpushには、それぞれの承認ルールが適用されます。

[公式のプラグイン内フック仕様](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)では、フック入りプラグインは手動導入向けです。利用先のフック対応状況と信頼状態を確認してください。

## 開発時の検証

Codex desktopのローカルセッションで実行します。

```sh
"$CODEX_MCP_NODE_PATH" --test tests/gate.test.cjs
```

一時Gitリポジトリで、実装の挙動と処理に関する回答から合格を保存し、PR作成フックが合格を確認する流れと、変更後の再受験を検証します。同梱Node.jsの絶対パスと、Gitだけを置いたPATHでもランチャーを動かします。
