# コーヒー焙煎待ち時間表示システム

更新版です。以下の修正を反映しています。

- 19時以降は自動で受付終了
- 受付終了時は注文追加不可
- 管理画面から本日の受注件数を削除
- 減少ラグを1分単位で設定可能
- ラグ0のときは即時に減少開始

## 反映ファイル

- `index.html` 公開画面
- `admin.html` 管理画面
- `history.html` 履歴画面
- `style.css` 共通スタイル
- `app.js` 共通ロジック
- `public.js` 公開画面処理
- `admin.js` 管理画面処理
- `history.js` 履歴画面処理
- `firebase-config.js` Firebase設定
- `firebase.rules.json` Realtime Database ルール例
- `sample-data.json` 初期データ例

## 重要事項

現在の Firebase ルールは動作確認用です。

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

本番前には認証導入とルール見直しが必要です。
