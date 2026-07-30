# 月拜訪計畫表 — 部署與使用說明

這個網站是純前端網頁（沒有自己的伺服器），資料庫用 **Google Firebase**（免費方案，Spark Plan）
來讓不同電腦、不同業務代表登入後能共用同一份拜訪資料，處長可以在自己的電腦看到所有人的資料。

> 安全性提醒：這是給內部團隊使用的輕量工具，登入機制足以區分「誰在填什麼資料」，
> 但不是銀行等級的安全防護（任何知道 Firebase 網址設定的人理論上都能碰資料庫）。
> 請不要拿來存放身分證字號、病歷等高敏感資料。

---

## 一、建立免費 Firebase 專案（約 5 分鐘，只需做一次）

1. 用你的 Google 帳號（futzufeng@gmail.com 或任何 Google 帳號）開啟
   https://console.firebase.google.com
2. 按「新增專案」，輸入專案名稱（例如 `monthly-visit-plan`），一路下一步建立完成。
3. 左側選單「建構」→「Firestore Database」→「建立資料庫」。
   - 位置選 `asia-east1`（台灣/亞洲）即可。
   - 安全性規則先選「以測試模式啟動」（等一下會換成正式規則）。
4. 左側選單「建構」→「Authentication」→「開始使用」→ 在「Sign-in method」分頁，
   啟用 **Anonymous（匿名）** 登入方式。這是給網頁內部用來連線 Firestore 的，
   跟業務代表登入的帳號密碼是分開的兩件事。
5. 左側選單齒輪 →「專案設定」→ 拉到「你的應用程式」→ 按網頁圖示 `</>` 新增一個網頁應用程式
   （名稱隨意），建立後畫面會顯示一段 `firebaseConfig = {...}` 的設定值。

## 二、把設定值貼到網站

打開 [firebase-config.js](firebase-config.js)，把上一步拿到的值填進對應欄位，例如：

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "monthly-visit-plan.firebaseapp.com",
  projectId: "monthly-visit-plan",
  storageBucket: "monthly-visit-plan.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxxxx",
};
```

存檔即可，不用改其他檔案。

## 三、設定 Firestore 安全規則

回到 Firebase 主控台 →「Firestore Database」→「規則」分頁，整段換成：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /accounts/{code} {
      allow read, write: if request.auth != null;
    }
    match /visits/{id} {
      allow read, write: if request.auth != null;
    }
  }
}
```

按「發布」。（`request.auth != null` 是指瀏覽器有成功做過匿名登入，也就是有開這個網站。）

## 四、啟動網站

直接在資料夾裡雙擊 `index.html` 用瀏覽器打開即可，不需要另外架設本機伺服器。

未來如果要讓所有業務代表都能連進來（每人各自的電腦/手機），把整個資料夾放到公司內部網站空間，
或用 Firebase Hosting 免費方案（`npm i -g firebase-tools` → `firebase deploy`）發佈成一個公開網址即可，
之後大家只要在自己的電腦/手機瀏覽器打開那個網址登入就好，資料都存在同一個 Firebase 資料庫。

## 五、第一次使用：初始化系統帳號

網站打開後，登入畫面上方若出現「系統偵測到帳號資料尚未建立」，按一次「初始化系統帳號」即可，
只需要做這一次（之後這個提示就不會再出現）。

## 六、登入帳號

| 帳號 | 說明 | 預設密碼 |
|---|---|---|
| SC11 ~ SC44（共 12 位業務代表） | 從客戶清單明細表帶入 | `0000` |
| 處長 | 管理員帳號，可查看所有代表資料與分析報表 | `admin2026` |

登入後每個人都可以自行按「修改密碼」換成自己的密碼。

## 七、功能說明

- **業務代表**：新增拜訪（先選醫院 → 選醫師 → 勾選日期 → 選產品分類/產品/拜訪分類），
  可一次勾選多天，會依勾選的每一天各自建立一筆紀錄；可查看/刪除本月自己的拜訪清單；
  可匯出 CSV、可列印。
- **處長**：多一個「檢視代表」下拉選單（全部 / 個別代表），以及「分析報表」分頁，
  可看到本月總拜訪數、依代表統計、依拜訪分類統計、依產品分類統計、拜訪次數前10大醫院。

## 八、如果客戶清單／產品檔／拜訪分類之後有更新

換掉資料夾裡的 `客戶清單明細表.xls` / `拜訪分類.xlsx` / `產品檔.xlsx`（檔名要一樣），
然後在這個資料夾執行：

```bash
python build_data.py
```

會重新產生 `data.js`，網站會自動套用新的客戶/產品/拜訪分類清單（不影響已經填寫的拜訪紀錄）。
