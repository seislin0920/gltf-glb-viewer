# GLB / GLTF 檢視器

在瀏覽器中直接開啟、檢視與編輯 3D 模型的本機工具。所有檔案皆於本機處理，**不會上傳**模型資料到伺服器。

線上版本：[https://seislin0920.github.io/gltf-glb-viewer/](https://seislin0920.github.io/gltf-glb-viewer/)

## 功能特色

- **本機載入**：支援 `.glb`、`.gltf` 及相關資源（`.bin`、貼圖等），可拖放或點選檔案開啟
- **3D 檢視**：以 Three.js 渲染，支援軌道旋轉、縮放、重設視角與視角輔助器
- **場景樹**：瀏覽模型節點階層、搜尋節點、多選（`Ctrl` / `Cmd` + 點擊）
- **檢視選項**：格線、線框模式、背景切換（暗色 / 亮色 / 透明）
- **模型調整**：移動整體模型位置、調整選取節點的旋轉
- **動畫**：播放、暫停既有動畫；調整名稱、播放速度與循環模式
- **旋翼動畫**：為指定節點新增或編輯旋轉動畫（支點、軸向、RPM 等），支援自動偵測
- **節點上色**：對選取節點套用純色或貼圖材質，可還原
- **匯出 GLB**：將目前場景（含動畫與材質修正）匯出為 `.glb` 檔下載

## 使用方式

### 線上使用

1. 開啟 [線上版本](https://seislin0920.github.io/gltf-glb-viewer/)
2. 將 GLB / GLTF 檔案拖放到畫面中央，或點擊右上角 **選擇模型**
3. 使用滑鼠在 3D 檢視區旋轉、縮放模型

### 介面說明

| 區域 | 說明 |
|------|------|
| **頂部列** | 選擇模型、顯示目前版號 |
| **左側場景樹** | 節點階層、搜尋、展開/收合、選取節點 |
| **中央檢視區** | 3D 模型顯示與檢視工具列 |
| **右側檢視器** | 模型資訊、位置/旋轉、動畫、旋翼設定、上色、匯出 |

### 檢視區工具列

- **重設視角**：回到預設相機位置
- **移動模型**：拖曳調整模型整體位置
- **格線**：顯示 / 隱藏地面格線
- **線框**：切換線框模式
- **背景**：暗色、亮色、透明三種背景

### 動畫與旋翼

1. 在右側面板切換至 **動畫** 區塊
2. 點選動畫項目可預覽播放，並調整速度與循環
3. 在 **旋翼動畫** 區塊選取目標節點，設定支點、旋轉軸、RPM 等參數
4. 可點擊 **自動偵測** 輔助推算支點與軸向
5. 套用後可於場景中預覽，再透過 **匯出 GLB** 下載含動畫的檔案

### 匯出

1. 在右側 **匯出 GLB** 區塊確認檔名
2. 點擊 **下載 GLB**，瀏覽器會下載處理後的模型檔

> 匯出時會自動修正玻璃材質等相容性問題，並保留已設定的動畫。

## 本機開發

### 環境需求

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+

### 安裝與啟動

```bash
# 安裝依賴
pnpm install

# 開發模式（熱更新）
pnpm run dev

# 建置正式版
pnpm run build

# 預覽建置結果
pnpm run preview
```

開發模式下，應用程式預設於 `http://localhost:5173` 啟動。

## 版號與發版

本專案採用 [Semantic Versioning](https://semver.org/)（`主版本.次版本.修訂版`）。

### 發版指令

```bash
# 修訂版（bug 修正）例：0.1.0 → 0.1.1
pnpm run release:patch

# 次版本（新功能、向下相容）例：0.1.0 → 0.2.0
pnpm run release:minor

# 主版本（破壞性變更）例：0.1.0 → 1.0.0
pnpm run release:major
```

每次發版會自動完成以下步驟：

1. 更新 `package.json` 中的版號
2. 建立 git commit 與 tag（例如 `v0.1.1`）
3. 推送 `main` 分支與 tag 至 GitHub
4. 觸發 [Release workflow](.github/workflows/release.yml)，建置並部署至 GitHub Pages

### 首次部署設定

在 GitHub 儲存庫中：

1. 前往 **Settings → Pages**
2. 將 **Source** 設為 **GitHub Actions**
3. 執行第一次發版（例如 `pnpm run release:patch`）
4. 部署完成後，網站網址為 `https://seislin0920.github.io/gltf-glb-viewer/`

### CI

推送至 `main` 或建立 Pull Request 時，[CI workflow](.github/workflows/ci.yml) 會自動執行 `pnpm run build` 驗證建置是否通過。

## 輔助工具（py-tool）

`py-tool/` 目錄包含獨立的 Python 腳本，用於離線批次處理 GLB 檔案：

| 腳本 | 說明 |
|------|------|
| `auto_add_rotor_animation.py` | 批次為 GLB 加入旋翼旋轉動畫 |
| `color.py` | 模型節點上色處理 |
| `orientation.py` | 模型方向調整 |

這些腳本與網頁版功能互補，適合需要命令列批次處理的場景。執行前請先安裝 Python 與相關依賴（如 `numpy`）。

## 技術棧

- [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Three.js](https://threejs.org/)
- [PrimeVue](https://primevue.org/) / [Tailwind CSS](https://tailwindcss.com/)

## 授權

本專案為私有專案（`private: true`）。如需對外發布或調整授權，請依專案需求自行設定。
