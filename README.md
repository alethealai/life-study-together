# 共讀花園

六位同伴共同記錄聖經與生命讀經進度的網站。每個人以自己的 Google 帳號登入，只能修改自己的閱讀進度與成就；花園主人可以邀請同伴並調整共同計畫。

## 本機執行

1. 複製 `.env.example` 為 `.env.local`，填入 Firebase Web App 設定。
2. 在 Firebase Authentication 啟用 Google 登入。
3. 建立 Firestore Database，並執行 `firebase deploy --only firestore:rules` 部署規則。
4. 執行 `npm install` 與 `npm run dev`。

## GitHub Pages

推送到 `main` 後，`.github/workflows/pages.yml` 會建立靜態網站並部署到 GitHub Pages。請在 GitHub repository variables 加入：

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Firebase Authentication 的授權網域也需要加入 GitHub Pages 網域，例如 `username.github.io`。
