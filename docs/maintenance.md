# 維護說明

## 閱讀與換書

`recordReading`、`updateReadingProfile`、`updateReadingPlan` 為 `asia-east1` 的 callable functions。身分一律來自驗證過的登入 token，計算依據為 Firestore 的計畫與摘要。

- `bibleProgress/lifeProgress` 與 `baseBible/baseLife` 屬於目前書目。
- `bibleRead/lifeRead` 是這座花園中實際閱讀的累積量；起始進度不計獎勵。
- `archivedBibleRead/archivedLifeRead` 是已封存書目的累積閱讀量，舊資料缺值視為 0。
- 一致性條件：目前已讀位置 = 起始位置 + 累積閱讀量 − 已封存閱讀量。
- 書目變更時，交易封存每個成員對應書目的摘要到 `members/{uid}/readingPeriods`，歸零該書目的起始／目前位置，並遞增書目期別和計畫版本。未變更的項目保留。
- 換回同一本書仍是新的一輪，不覆寫先前摘要。封存包含尚未讀完的書，不代表完成整本。
- 全花園的獎勵累積、連續日期與已取得／放置的 emoji 保留。第一次閱讀後獎勵門檻固定。
- 新閱讀紀錄保存書名、期別、前後位置及對應獎勵 ID；缺書名的舊紀錄不猜測補值。
- 閱讀與計畫請求均使用固定 requestId 和去重收據；相同請求重送不再次寫入。跨裝置舊版本回報衝突，須重新開啟表單。
- 封存進度僅本人可讀，前端每頁按需讀取 12 筆。全體成員的摘要與新書位置在換書時一起更新。

目前換書交易最多支援 100 個成員，供小型封閉共讀使用。尚未引入大量成員的分批換書作業。既有閱讀明細與獎勵監聽仍需在後續分頁／快取工作中調整。

## 測試

需要 Node.js 22 與 Java 21。

```sh
npm run test:integrity
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

整合測試使用 `demo-life-study` 的 Auth、Functions、Firestore 模擬器，不存取正式資料。測試包含身分、本人權限、偽造寫入、去重、交易回滾、跨裝置競爭、換書封存與多花園隔離。

測試使用 `firebase.test.json` 的獨立連接埠 8180／9199／5101，避免清除開發預覽中的資料。測試腳本會清除測試模擬器資料，不能指向正式服務。

## 本機互動預覽

先在一個終端啟動模擬器：

```sh
npx firebase emulators:start --project demo-life-study --only firestore,auth,functions
```

另開終端建立本機帳號並啟動網站：

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/seed-local.mjs
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true npm run dev -- --webpack --hostname 127.0.0.1
```

本機帳號為 `owner@example.test`、`reader@example.test`，密碼均為 `GardenTest123!`，僅存在 demo 模擬器。初始化腳本不覆寫既有本機花園或帳號。未匯出模擬器資料時，關閉模擬器會清除本機測試資料。正式 build 不啟用這個模式。

可選書目與目錄整理方式見 [文集目錄說明](cwwl-catalog.md)。文集的 `baseCwwl`、`cwwlProgress`、`cwwlRead`、`archivedCwwlRead` 遵循同樣的一致性條件；舊成員缺少這些欄位時視為 0。

若本機 Turbopack 不可用，可以 `npx next build --webpack` 驗證靜態匯出。

## 外部閱讀連結

個人頁的「開始讀吧！」按鈕以目前位置加一，另開官方網站。聖經使用恢復本 `/verse/{書卷編號}/{章}`；生命讀經採用官方目錄中的實際連結，保存在 `lib/reading-link-catalog.json`（2026-10-12 核對）。目錄包含 66 卷入口、各篇網址及顯示名稱，不保存正文。上下卷合併出版及約翰壹／貳／參書名稱依官方目錄對應。

已讀完不產生下一篇連結；自訂、無法對應的生命讀經名稱提供官方目錄入口。按鈕本身不寫入閱讀紀錄或發獎。更新連結目錄後執行 `node --test tests/reading-links.test.mjs`，並以瀏覽器抽查實際目的頁。

## 既有資料核對

既有 UID、帳號、花園、閱讀紀錄與獎勵保留。後端寫入需要 garden/member 的 `schemaVersion: 2`。管理者以 Application Default Credentials 明確指定專案和花園，先執行唯讀核對：

```sh
node functions/audit-garden.mjs PROJECT_ID GARDEN_ID
```

核對工具分頁讀取資料，比對摘要、歷史閱讀量、封存及應有獎勵；無法還原缺失書名或證明舊有閱讀內容的真實性。不一致必須人工處理，不會自動刪除、猜測修復或補發。

## 發布順序

確認 Functions 所需的 Firebase 計費方案、區域和部署權限。先備份資料、安排短暫停止寫入，並檢視核對結果；發布新規則封住舊客戶端直接寫入後，才套用已確認的 metadata 遷移：

```sh
node functions/audit-garden.mjs PROJECT_ID GARDEN_ID --apply-reviewed
```

套用時會在交易內重新核對全部資料，僅加入版本、筆數及最近日期等 metadata，不變動舊紀錄、獎勵與閱讀量。此完整交易僅適合小型測試資料，並非每次閱讀時執行。

接著部署 Functions 與 Hosting，驗收管理者與普通成員。新版前端、規則及 Functions 必須配套發布；不要單獨部署前端或回退成允許直接發獎的舊規則。

`.github/workflows/pages.yml` 是既有 GitHub Pages 流程；Firebase Hosting 需另外發布。模擬器測試通過不等於已完成正式站與手機驗收。
