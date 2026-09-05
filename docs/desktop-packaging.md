# PowerSource Workbench 桌面端打包指南

本文記錄 PowerSource Workbench Electron 桌面端的正式打包流程。macOS 產物必須完成 Developer ID 簽名、Apple 公證（notarization）與票據裝訂（stapling）後才可交付。

## 1. 專案與發佈設定

| 項目 | 值 |
| --- | --- |
| Electron 專案 | `desktop/` |
| Bundle ID | `com.workbench.desktop` |
| 產品名稱 | `PowerSource Workbench` |
| Apple Team ID | `TK5J4CUQ7J` |
| 簽署身分 | `Developer ID Application: YANGHAO LIN (TK5J4CUQ7J)` |
| Notarytool profile | `Workbench-notary` |
| 打包輸出 | `desktop/release/{version}/` |
| Supabase Storage bucket | `desktop-releases` |

版本取自 `desktop/package.json`。若只是修正同一個測試包，可以維持版本不變並覆蓋本機產物；對外發佈時應使用新的 SemVer 版本，避免使用者或快取取得舊檔。

## 2. 必要環境

- macOS 與 Xcode Command Line Tools
- Node.js 24 以上、npm 10 以上
- 可用的 Developer ID Application 憑證與私鑰
- 已儲存在 macOS Keychain 的 `Workbench-notary` profile
- `desktop/.env`

確認環境：

```bash
node --version
npm --version
security find-identity -v -p codesigning
xcrun notarytool history --keychain-profile Workbench-notary
```

`security find-identity` 應顯示：

```text
Developer ID Application: YANGHAO LIN (TK5J4CUQ7J)
```

若尚未建立公證 profile，先在 Apple 帳號產生 App 專用密碼，再執行：

```bash
xcrun notarytool store-credentials "Workbench-notary" \
  --apple-id "jonathan@powersource.cn" \
  --team-id "TK5J4CUQ7J" \
  --password "APP-SPECIFIC-PASSWORD"
```

App 專用密碼只能存入 Keychain，不可寫入 `.env`、文件或 Git。

## 3. `.env` 的處理方式

先確認 `desktop/.env` 存在。正式檔可依專案根目錄 README 的環境設定流程產生：

```bash
python3 scripts/configure-local-env.py
```

`electron-builder.json` 會把 `.env` 作為 `extraResources` 複製到：

```text
PowerSource Workbench.app/Contents/Resources/.env
```

其中的 `VITE_*` 變數也會在 Vite 建置時編譯進前端資源。不要把 service-role key、Apple 密碼、私鑰或其他伺服器端密鑰放入桌面端 `.env`；桌面安裝包的內容可被終端使用者讀取。

## 4. 建置前檢查

從 repository 根目錄執行：

```bash
cd desktop
npm install
npm run lint
npm run typecheck
npm run build:vite
```

Vite 的 chunk-size 或 native config loader 警告目前不會阻止打包；lint、typecheck 或 build error 則必須先修正。

## 5. macOS Apple Silicon 打包

```bash
cd desktop
APPLE_KEYCHAIN_PROFILE=Workbench-notary \
  npx electron-builder --mac dmg --arm64
```

以 `0.1.0-beta` 為例，主要產物為：

```text
release/0.1.0-beta/mac-arm64/PowerSource Workbench.app
release/0.1.0-beta/PowerSource Workbench-0.1.0-beta-arm64.dmg
```

## 6. macOS Intel 打包

```bash
cd desktop
APPLE_KEYCHAIN_PROFILE=Workbench-notary \
  npx electron-builder --mac dmg --x64
```

主要產物為：

```text
release/0.1.0-beta/mac/PowerSource Workbench.app
release/0.1.0-beta/PowerSource Workbench-0.1.0-beta.dmg
```

兩個架構可以一次依序建置：

```bash
APPLE_KEYCHAIN_PROFILE=Workbench-notary npx electron-builder --mac dmg --arm64 && \
APPLE_KEYCHAIN_PROFILE=Workbench-notary npx electron-builder --mac dmg --x64
```

`electron-builder` 會簽署 App、提交 Apple 公證、等待 `Accepted`、裝訂票據，再建立 UDZO 壓縮 DMG。不要在公證尚未完成時交付中間的 `.app`。

## 7. macOS 產物驗證

```bash
VERSION="0.1.0-beta"
RELEASE_DIR="$PWD/release/$VERSION"

for APP_PATH in \
  "$RELEASE_DIR/mac-arm64/PowerSource Workbench.app" \
  "$RELEASE_DIR/mac/PowerSource Workbench.app"; do
  xcrun stapler validate "$APP_PATH"
  codesign --verify --deep --strict --verbose=2 "$APP_PATH"
  spctl --assess --type execute --verbose=4 "$APP_PATH"
done

hdiutil verify "$RELEASE_DIR/PowerSource Workbench-$VERSION-arm64.dmg"
hdiutil verify "$RELEASE_DIR/PowerSource Workbench-$VERSION.dmg"

shasum -a 256 \
  "$RELEASE_DIR/PowerSource Workbench-$VERSION-arm64.dmg" \
  "$RELEASE_DIR/PowerSource Workbench-$VERSION.dmg"
```

成功時 Gatekeeper 會顯示：

```text
accepted
source=Notarized Developer ID
```

DMG 驗證結果應為 `VALID`。

除了簽名驗證，也必須實際啟動 Apple Silicon App，確認它不會在 Electron 初始化階段退出：

```bash
open "$RELEASE_DIR/mac-arm64/PowerSource Workbench.app"
```

## 8. 安裝到本機

先退出正在執行的 Workbench，再把 Apple Silicon App 複製到 Applications：

```bash
pkill -x "PowerSource Workbench" 2>/dev/null || true
ditto \
  "$PWD/release/0.1.0-beta/mac-arm64/PowerSource Workbench.app" \
  "/Applications/PowerSource Workbench.app"
open "/Applications/PowerSource Workbench.app"
```

若要保留舊版，覆蓋前先把 `/Applications/PowerSource Workbench.app` 移到垃圾桶並加上可識別的備份名稱。

## 9. Windows NSIS 打包

Windows 產物應在 Windows x64 環境打包，不要在 macOS 交叉打包：

```powershell
cd desktop
npm install
npm run lint
npm run typecheck
npm run build:vite

$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npx electron-builder --win nsis --x64 --config.forceCodeSigning=false
```

目前沒有設定 Windows Authenticode 憑證，因此需以 `forceCodeSigning=false` 建置，使用者可能看到未知發行者提示。

## 10. 上傳到 Supabase Storage

正式安裝包放在 Workbench VPS 上的 Supabase Storage，不是本機、也不是 GeoCRM 的 `powersource.app`。桌面自動更新與 `https://binovo.ai/download` 都讀同一個公開來源。

### 10.1 放哪裡

| 項目 | 值 |
| --- | --- |
| Bucket | `desktop-releases`（公開，單檔上限 1 GiB） |
| 物件路徑 | `{platform}/{release}/{file}` |
| 平台資料夾 | `macos-m`（Apple Silicon）、`macos-i`（Intel）、`windows` |
| Release 資料夾 | `package.json` 的 `0.1.0-beta` → `beta0.1.0`；正式版用 `v0.1.0` |
| 建議檔名 | macOS `workbench.dmg`；Windows `workbench.exe` |

範例：

```text
desktop-releases/macos-m/beta0.1.0/workbench.dmg
desktop-releases/macos-i/beta0.1.0/workbench.dmg
desktop-releases/windows/beta0.1.0/workbench.exe
```

`/beta` 會自動選該平台下最新的 `beta*` 資料夾；`/latest` 會優先選正式版。同一批三個平台必須用同一個 release 名稱。Apple Silicon 不可放到 `macos-i`，Intel 不可放到 `macos-m`。

Dashboard 若手動上傳，路徑與檔名必須完全符合上表。Authenticated 使用者只有 system admin 能寫入；一般流程不要用手傳，改用下面的腳本（腳本在 VPS 上用 service role 寫入）。

### 10.2 上傳前確認

1. 本機已有簽名／公證完成的安裝包（第 5–9 節）。
2. 倉庫根目錄的忽略檔 `.env.vps` 指向 Workbench VPS（`IP`、`Username`、`Passwd`）。
3. VPS 已套用 `supabase/migrations/20260906020000_desktop_releases_bucket.sql`（`python scripts/deploy-remote.py` 會套用 migrations）。
4. `download.powersource.work` 已指向同一台主機，並跑過 `python scripts/setup-download-nginx-vps.py`。

不要把 `SERVICE_ROLE_KEY` 寫進 `desktop/.env` 或文件。腳本會 SSH 進 VPS，從 `/opt/supabase-project/.env` 讀取該金鑰。

### 10.3 用腳本上傳

從 repository 根目錄執行。腳本先 SFTP 到 VPS 暫存，再 POST 到 `supabase-storage`，並以 `x-upsert: true` 覆蓋同路徑舊檔。省略 `--name` 時，macOS 預設 `workbench.dmg`、Windows 預設 `workbench.exe`。

以 `0.1.0-beta` → `beta0.1.0` 為例：

```bash
python3 scripts/upload-desktop-release-vps.py \
  "desktop/release/0.1.0-beta/PowerSource Workbench-0.1.0-beta-arm64.dmg" \
  macos-m beta0.1.0 --name workbench.dmg

python3 scripts/upload-desktop-release-vps.py \
  "desktop/release/0.1.0-beta/PowerSource Workbench-0.1.0-beta.dmg" \
  macos-i beta0.1.0 --name workbench.dmg

python3 scripts/upload-desktop-release-vps.py \
  "desktop/release/0.1.0-beta/PowerSource Workbench Setup 0.1.0-beta.exe" \
  windows beta0.1.0 --name workbench.exe
```

成功時終端會印出 Storage 列與 `OK: macos-m/beta0.1.0/workbench.dmg`。只有在明確要對外發佈時才上傳；本機測試打包不需要上傳。

### 10.4 上傳後核對

清單（JSON）：

```bash
curl -sS -H "Accept: application/json" \
  "https://download.powersource.work/macos-m/beta?format=json"
```

應回傳 `ok: true`、`release` 為 `beta0.1.0`、`version` 為 `0.1.0`，以及 `downloadUrl`。三個平台都查一次。尚未上傳時是 `404` / `Release not found`。

直接下載（會串流安裝包，勿在檢查時整檔存下來除非有意測試）：

```text
https://download.powersource.work/macos-m/beta
https://download.powersource.work/macos-i/beta
https://download.powersource.work/windows/beta
```

公開下載頁 `https://binovo.ai/download` 也打同一個 `/beta` 清單。有檔後按鈕會從 Coming soon 變成 Download 並顯示版本號。已安裝的桌面端會依序查 `latest`、`beta`、目前版本，較新才提示更新。

## 11. 常見問題

### 啟動時顯示「PowerSource Workbench 未預期地結束」

若終端輸出包含：

```text
FATAL: electron/shell/app/electron_main_delegate_mac.mm:66
Unable to find helper app
```

通常是主 App 的 `CFBundleName` 與 Electron Helper 的名稱不同。`desktop/electron-builder.json` 必須保持：

```json
"productName": "PowerSource Workbench"
```

以及：

```json
"CFBundleName": "PowerSource Workbench",
"CFBundleDisplayName": "PowerSource Workbench"
```

不要把 `CFBundleName` 簡寫成 `Workbench`，否則 Electron 會尋找不存在的 `Workbench Helper.app`。

### 公證很慢

公證時間由 Apple 控制，可能從數分鐘到數小時不等。只要 `electron-builder` 尚未回傳 `notarization successful`，就不要中止或交付產物。可另開終端查看提交記錄：

```bash
xcrun notarytool history --keychain-profile Workbench-notary
```

### 確認 `.env` 是否被打包

只檢查檔案與雜湊，不要把內容輸出到日誌：

```bash
shasum -a 256 \
  desktop/.env \
  "/Applications/PowerSource Workbench.app/Contents/Resources/.env"
```

兩個 SHA-256 應一致。
