# 老師資料設定指南 / Teacher data setup guide

給 **cyh@clam.edu.hk** 的一次性設定步驟，不需要懂程式。
One-time setup for **cyh@clam.edu.hk**. No coding knowledge needed — just careful copy-and-paste.

做完 A 和 B 之後，遊戲就會：把每一次遊戲記錄存入 Firestore（給儀表板用），
同時也存一份到你自己的 Google 試算表（方便你隨時打開看、篩選、存檔）。

Once you finish A and B, the site will: save every finished game as a record
in Firestore (for the dashboard), and also copy the same record into your own
Google Sheet (so you can open it anytime, filter it, or keep it as an
archive).

---

## A. 套用 Firestore 保安規則 / Apply the Firestore security rules

**這一步做什麼？** 現在資料庫是「測試模式」，任何登入的人理論上都能亂改別人的
資料。套用規則之後，學生只能寫自己的分數、只有你（老師帳戶）能改設定或看
所有學生的原始記錄。

**What this does:** Right now the database is in "test mode" — anyone signed
in could technically tamper with someone else's data. After you publish these
rules, students can only write their own scores, and only your teacher
account can change settings or read every student's raw attempt records.

1. 開啟 [Firebase 控制台](https://console.firebase.google.com/)，選擇專案
   **p1-maths**。
   Open the [Firebase console](https://console.firebase.google.com/) and
   select the **p1-maths** project.
2. 左邊選單 → **Firestore Database** → 上方分頁 **Rules**。
   Left sidebar → **Firestore Database** → the **Rules** tab at the top.
3. 打開這個 repo 裡的 `firestore.rules` 檔案，全選、複製全部內容。
   Open the `firestore.rules` file in this repo, select all, and copy it.
4. 回到 Firebase 控制台，把 Rules 編輯框裡原本的內容全部刪掉，貼上剛剛複製的
   內容。
   Back in the Firebase console, delete everything in the Rules editor and
   paste in what you just copied.
5. 按右上角 **Publish**（發佈）。幾秒鐘內就會生效，不需要重新部署網站。
   Click **Publish** in the top right. It takes effect within seconds — you
   don't need to redeploy the website itself.

**套用後會改變什麼 / What changes for everyone:**

- 學生：可以繼續玩遊戲、看排行榜；但無法讀取或修改別人的分數，也無法讀取
  「attempts」原始記錄（那是給老師看的）。
  Students: can still play and see leaderboards, but cannot read or edit
  anyone else's scores, and cannot read the raw "attempts" records (those are
  teacher-only).
- 老師（⚙️ 面板）：只有用 **cyh@clam.edu.hk** 這個 Google 帳戶登入時，
  「Save Global Settings」才會真正存進資料庫；用其他帳戶登入會被拒絕（畫面
  上會顯示「Saved locally only」）。
  Teacher (⚙️ panel): "Save Global Settings" only actually saves when you are
  signed in as **cyh@clam.edu.hk**. Any other account gets rejected (the
  screen will say "Saved locally only").
- 排行榜 / 自己最高分：完全不受影響，一樣正常運作。
  Leaderboards and "my best score": unaffected, work exactly as before.

---

## B. 設定 Google 試算表 / Set up the Google Sheet

### B1. 建立試算表和腳本 / Create the sheet and the script

1. 開啟 [Google Sheets](https://sheets.new)，建立一張新的空白試算表，改個
   名字，例如「P1 Maths 遊戲記錄」。
   Open [Google Sheets](https://sheets.new) to create a new blank
   spreadsheet, and rename it to something like "P1 Maths game log".
2. 上方選單 **Extensions（擴充功能）→ Apps Script**。會開一個新分頁，裡面
   是一個空白的程式編輯器。
   Menu bar **Extensions → Apps Script**. This opens a new tab with an empty
   code editor.
3. 把編輯器裡預設的內容（`function myFunction() {}`）全部刪掉，改貼上這個
   repo 裡 `apps-script/Code.gs` 的**全部內容**。
   Delete the default placeholder code (`function myFunction() {}`) and
   paste in the **entire contents** of `apps-script/Code.gs` from this repo.
4. 按左上角的儲存圖示（磁碟片）存檔。
   Click the save icon (floppy disk) in the top left.
5. 在編輯器上方的函式下拉選單，選擇 **setup**，然後按 **Run（執行）**。
   In the function dropdown near the top of the editor, choose **setup**,
   then click **Run**.
6. 第一次執行會跳出授權視窗：**Review permissions → 選你的 Google 帳戶 →
   Advanced（進階）→ Go to ... (unsafe) → Allow（允許）**。這是正常的，因為
   這是你自己寫（貼上）的腳本，Google 只是還不認識它。
   The first run pops up an authorization screen: **Review permissions →
   pick your Google account → Advanced → Go to ... (unsafe) → Allow**. This
   is normal — Google just doesn't recognise a script you've pasted in
   yourself yet.
7. 執行完成後回到你的試算表分頁，應該會看到多了一個叫 **Attempts** 的
   工作表，有一列已經加粗、凍結的標題列（Date、Time、Name...）。
   Once it finishes, switch back to the spreadsheet tab — you should see a
   new sheet tab called **Attempts** with a bold, frozen header row (Date,
   Time, Name, …).

### B2. 部署成網頁 / Deploy it as a web app

1. 回到 Apps Script 編輯器，右上角 **Deploy（部署）→ New deployment
   （新增部署）**。
   Back in the Apps Script editor, top right **Deploy → New deployment**.
2. 點齒輪圖示選 **Web app**。
   Click the gear icon and choose **Web app**.
3. 設定：**Execute as（執行身分）= Me（我）**；**Who has access（誰可以
   存取）= Anyone（任何人）**。這個「任何人」是必要的，因為遊戲網頁本身
   沒有登入 Google 帳號的能力去呼叫這個網址（見下方「隱私提醒」）。
   Settings: **Execute as = Me**; **Who has access = Anyone**. "Anyone" is
   required here because the game page itself has no way to sign in with a
   Google account when it calls this URL (see the privacy note below).
4. 按 **Deploy**，再次授權的話照剛剛的步驟允許即可。
   Click **Deploy**, and approve the authorization prompt again if it asks.
5. 完成後會顯示一個 **Web app URL**（網址），把它整個複製下來。它長得像
   `https://script.google.com/macros/s/AKfycb.../exec`。
   You'll get a **Web app URL** — copy the whole thing. It looks like
   `https://script.google.com/macros/s/AKfycb.../exec`.

**怎麼確認網址有效 / How to check the URL works:**
把網址貼到瀏覽器分頁打開，應該會看到一行文字：
`Rod Town sheet endpoint is working`。如果看到別的（例如登入畫面或錯誤），
回頭檢查步驟 B2 的存取權設定。
Paste the URL into a browser tab and open it — you should see the line
`Rod Town sheet endpoint is working`. If you see something else (like a
sign-in screen or an error), re-check the access setting in step B2.

### B3. 把網址貼到遊戲裡 / Paste the URL into the game

1. 用 **cyh@clam.edu.hk** 登入遊戲網站（例如 GitHub Pages 上的網址）。
   Sign in to the game site (e.g. its GitHub Pages URL) as
   **cyh@clam.edu.hk**.
2. 按 ⚙️ → 輸入 PIN → 找到「Google Sheet link (Apps Script URL)」欄位，
   貼上剛剛複製的網址。
   Click ⚙️ → enter the PIN → find the "Google Sheet link (Apps Script URL)"
   field and paste the URL you copied.
3. 按 **Save Global Settings**。看到「Settings saved globally.」就是成功了
   （前提是你是用 cyh@clam.edu.hk 登入 — 見 A 段落）。
   Click **Save Global Settings**. "Settings saved globally." means it
   worked (this only succeeds when you're signed in as cyh@clam.edu.hk — see
   section A).
4. 之後玩一局任何遊戲，回去試算表的 **Attempts** 分頁，應該會多一行資料。
   Now play one round of any game, then check the **Attempts** tab in your
   spreadsheet — a new row should appear.

**之後修改了 Code.gs 要怎麼重新部署 / Redeploying after you edit Code.gs:**
不能只按存檔，網址不會自動更新內容。要：**Deploy → Manage deployments
（管理部署）→ 選現有的部署按鉛筆圖示 → Version（版本）選 New version
（新版本）→ Deploy**。這樣網址不變，但內容會更新。
Saving alone does not update the live URL's behaviour. You must: **Deploy →
Manage deployments → click the pencil icon on the existing deployment →
Version → New version → Deploy**. This keeps the same URL but updates what
it runs.

**隱私提醒 / Privacy note:** 這個網址是公開的 — 任何知道網址的人都可以
用它「寫入」一筆假資料到你的試算表（但無法讀取試算表內容，也無法碰
Firestore）。請不要把這個網址貼在公開網頁或分享出去；當作班別密碼一樣
保管。試算表本身會有學生的姓名和 Google 帳號 email，所以試算表的分享
權限也請維持「只有自己」。萬一網址外流，回到 B2 建立一個新的部署即可
換一個新網址。
This URL is public — anyone who has it can use it to "write" a fake row into
your sheet (but they cannot read the sheet, and cannot touch Firestore at
all). Don't post this URL anywhere public; treat it like a class password.
The sheet itself will contain student names and Google account emails, so
keep the sheet's sharing setting as "only me" too. If the URL ever leaks,
just create a new deployment in B2 to get a fresh URL.

---

## C. 老師儀表板 / The teacher dashboard

**在哪裡 / Where it is:** 網站的 `teacher.html`，也可以從遊戲裡的 ⚙️ 面板
（輸入 PIN 之後）找到「📊 Teacher dashboard」連結直接點過去。
On the site at `teacher.html`; you can also reach it from the game's ⚙️
panel (after entering the PIN) via the "📊 Teacher dashboard" link.

**怎麼用 / How to use it:**

1. 用 **cyh@clam.edu.hk** 登入（用其他帳戶登入會看到「此頁只限老師 /
   Teachers only」，不會顯示任何資料）。
   Sign in as **cyh@clam.edu.hk** (any other account sees "此頁只限老師 /
   Teachers only" and no data at all).
2. **Overview（總覽）**分頁：每個學生一行，包含最後遊玩時間、這段時間玩了
   幾次、各遊戲的最佳成績。
   **Overview** tab: one row per student — last played, how many attempts in
   the date range, best scores per game.
3. **Attempts（記錄）**分頁：每一次遊戲一行，最新的在最上面，可以用遊戲
   種類 / 學生 / 日期範圍篩選。
   **Attempts** tab: every single play session, newest first, filterable by
   game / student / date range.
4. **Student（學生）**分頁：點任何一個學生的名字，看他的歷史記錄和 Rod
   Town 地圖進度。
   **Student** tab: click any student's name to see their history and Rod
   Town map progress.
5. Overview 和 Attempts 分頁都有 **Download CSV** 按鈕，下載的檔案可以直接
   用 Excel 或 Google Sheets 打開，中文字不會亂碼。
   Both Overview and Attempts have a **Download CSV** button; the file opens
   cleanly in Excel or Google Sheets with Chinese text intact.

---

## D. 疑難排解 / Troubleshooting

**「Saved locally only (offline).」或設定存不進去 / Settings won't save,
or you see "Saved locally only (offline)."**
檢查你是不是用 **cyh@clam.edu.hk** 登入（不是其他 Google 帳戶），並確認
段落 A 的保安規則已經 Publish 過。
Check you're signed in as **cyh@clam.edu.hk** (not another Google account),
and that the security rules in section A were actually Published.

**試算表一直沒有新的一行 / No new rows appear in the sheet**
- 先用瀏覽器打開你的 Web app URL，確認會看到
  `Rod Town sheet endpoint is working`（見 B2）。看不到的話重新部署一次。
  Open your Web app URL in a browser first and confirm you see `Rod Town
  sheet endpoint is working` (see B2). If not, redeploy.
- 確認 ⚙️ 面板裡的「Google Sheet link」欄位有貼對網址，而且是用
  cyh@clam.edu.hk 登入按下 Save 的（不是用其他帳戶，否則存不進
  `settings/global`）。
  Confirm the "Google Sheet link" field in the ⚙️ panel has the right URL
  pasted in, and that you clicked Save while signed in as cyh@clam.edu.hk
  (any other account can't write to `settings/global`).
- 改過 Code.gs 之後有沒有照 B2 最後一段「Redeploying」建立 **New version**？
  只存檔不會更新已部署的網址。
  If you edited Code.gs, did you create a **New version** as described at
  the end of B2? Saving alone does not update the already-deployed URL.
- Rod Town / Number Shop / Market 有沒有開著「🧪 Test mode」？測試模式不會
  寫入 Firestore，也不會傳到試算表（這是設計如此，方便老師試玩不留紀錄）。
  Is "🧪 Test mode" turned on in Rod Town / Number Shop / Market? Test mode
  never writes to Firestore and never sends anything to the sheet — that's
  intentional, so the teacher can try levels without leaving fake records.

**儀表板顯示「此頁只限老師 / Teachers only」/ Dashboard shows "Teachers
only"**
表示目前登入的帳戶不是 cyh@clam.edu.hk。按頁面上的登出再用正確帳戶重新
登入。如果你確定帳戶正確卻還是被拒絕，檢查段落 A 的規則裡
`cyh@clam.edu.hk` 有沒有打錯字，並重新 Publish。
This means the signed-in account is not cyh@clam.edu.hk. Sign out and sign
back in with the correct account. If you're sure the account is right and
it's still rejected, check for a typo in `cyh@clam.edu.hk` inside the
section A rules and re-Publish.

**用錯帳戶登入 Firebase 控制台或 Apps Script / Signed into the wrong Google
account for Firebase console or Apps Script**
Firebase 控制台的帳戶（用來編輯 Rules）跟遊戲的登入帳戶不用是同一個 —
只要你能存取 p1-maths 這個 Firebase 專案即可。但 Apps Script 和「Google
Sheet link」建議都用同一個 Google 帳戶（例如 cyh@clam.edu.hk），比較不會
搞混誰擁有哪個試算表。
The Google account you use for the Firebase console (to edit Rules) doesn't
have to match the game's sign-in account — it just needs access to the
p1-maths Firebase project. But for Apps Script and the sheet, it's simplest
to use one consistent account (e.g. cyh@clam.edu.hk) so it's always clear
who owns which spreadsheet.
