# 共讀花園

和熟悉的同伴一起閱讀，記錄各自的進度，讓閱讀累積成共同花園裡的 emoji。

[前往共讀花園](https://life-study-together.firebaseapp.com/)

## 專案方向

- 使用 Email／密碼登入，以邀請碼加入共讀花園。
- 各花園獨立記錄閱讀進度，呈現共同計畫與同伴的閱讀旅程。
- 透過閱讀取得 emoji，自由放進共同花園。
- 保留個人閱讀歷史，不排名、不評分，也不提供聊天或社群互動。

專案目前仍在準備封閉測試，本機開發版本與已上線版本可能不同。

## 本機開發

使用 Node.js 22。

```sh
npm ci
npm ci --prefix functions
```

複製 `.env.example` 為 `.env.local`，填入 Firebase Web App 設定，再執行 `npm run dev`。技術組成為 Next.js 靜態匯出、Firebase Authentication、Firestore、Cloud Functions 與 Firebase Hosting。

測試、資料保存與發布方式見 [維護說明](docs/maintenance.md)。
