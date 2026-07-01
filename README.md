# coop-daily-menu-notifier

デイリーコープ（コープデリ）の「舞菜おかず」「舞菜しっかりおかず」の献立を取得し、Discordに通知するNode.js/TypeScript製ツール。GitHub Actionsのスケジュール実行で完結し、常駐サーバーは不要。

## 仕組み

1. Playwrightでコープデリeフレンズ（`https://daily.coopdeli.jp/auth/login.html`）にログイン
2. 「デイリーコープ」タブから「メインメニュー献立カレンダー（PDF）」のリンクを取得
   - このPDFは月〜金5日分・全コース（舞菜おかず／しっかりおかず／御膳／弁当／ミニ弁当）分の献立が1枚にまとまった週間カレンダー。ログイン不要で直接ダウンロード可能だが、URL（`daily_menu_XXX.pdf`の日付フォルダ）は毎回サイトを見に行かないと分からないため、都度ログインして探索している
3. `pdftotext -layout`（poppler-utils）でPDFをテキスト化
4. AWS Bedrock（Claude Haiku, `jp.anthropic.claude-haiku-4-5-20251001-v1:0`, ap-northeast-1）でテキストを「月: 主菜（副菜...）」の曜日別リストに整形
   - `USE_BEDROCK=false`または呼び出し失敗時は、簡易的な正規表現ベースの抽出にフォールバック
5. 月曜のみ週間分すべて、それ以外の通知日はその日の行だけを抽出してDiscord Webhookに送信

## 実行スケジュール

`.github/workflows/daily_notify.yml` で **月・水・金 18:00 JST**（`0 9 * * 1,3,5` UTC）に自動実行。`workflow_dispatch` で手動実行も可能（`debug_scrape` 入力をtrueにするとデバッグ用スクリーンショット/HTMLをアーティファクトとして保存する）。

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
npx playwright install chromium
# ローカルでPDFテキスト抽出を行うには poppler-utils が必要
brew install poppler   # macOS
```

### 2. 環境変数

`.env.example` を `.env` にコピーして値を設定する。

| 変数 | 説明 |
|---|---|
| `DISCORD_WEBHOOK_URL` | 通知先のDiscord Webhook URL |
| `COOP_MEMBER_CODE` | コープデリeフレンズの組合員コード |
| `COOP_PASSWORD` | 同パスワード |
| `LOGIN_URL` | ログインページURL（通常は変更不要） |
| `DEBUG_SCRAPE` | `true`でスクレイピング各ステップのスクリーンショット/HTMLを`debug/`に保存 |
| `USE_BEDROCK` | `true`でBedrockによる整形を有効化 |
| `AWS_REGION` | Bedrock呼び出しリージョン（既定 `ap-northeast-1`） |
| `BEDROCK_MODEL_ID` | 使用するBedrockモデルID |

GitHub Actions側では、上記に加えて `AWS_BEDROCK_ROLE_ARN`（OIDCで引き受けるIAMロールARN）をSecretsに設定する。ロール自体は `infra/github-oidc-bedrock-role.yaml` をCloudFormationでデプロイして作成する（`bedrock:InvokeModel` のみを許可する最小権限）。

### 3. 実行

```bash
npm run dev     # ts-nodeで直接実行
npm run build   # 型チェック＋dist生成
npm start        # ビルド済みJSを実行
```

## 既知の制約

- ログインフォーム・献立ページのDOM構造はサイトの実装に依存しており、レイアウト変更で壊れる可能性がある。`DEBUG_SCRAPE=true`で原因調査用のスクリーンショット/HTMLを取得できる（**組合員コードや実名がスクリーンショットに写り込むため、確認後は速やかに削除すること**）。
- Bedrock整形は完璧ではない（特に「舞菜しっかりおかず」はPDF内のレイアウトが複雑で、まれに料理名が混ざる）。通知メッセージには必ず公式PDFへの直リンクを併記しており、正確な情報はそちらで確認できる。
- 献立カレンダーPDFのURL（日付フォルダ）が毎週どういう規則で決まるかは未解明。近い日付を試すと同じ内容が返ることがある一方、翌週分はまだ存在しないと302が返ることを確認済み。そのため固定URLを推測するのではなく、毎回ログインして実際のリンクを取得する方式にしている。
