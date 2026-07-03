# GLB / GLTF 檢視器

在瀏覽器中直接開啟、檢視與編輯 3D 模型的本機工具。所有檔案皆於本機處理，**不會上傳**模型資料到伺服器。

## 功能特色

- **本機載入**：支援 `.glb`、`.gltf` 及相關資源（`.bin`、貼圖等），可拖放或點選檔案開啟
- **3D 檢視**：以 Three.js 渲染，支援軌道旋轉、縮放、重設視角與視角輔助器
- **場景樹**：瀏覽模型節點階層、搜尋節點、多選（`Ctrl` / `Cmd` + 點擊）
- **檢視選項**：格線、線框模式、背景切換（暗色 / 亮色 / 透明）
- **模型調整**：移動整體模型位置、調整選取節點的旋轉
- **動畫**：播放、暫停既有動畫；調整名稱、播放速度與循環模式
- **旋翼動畫**：為指定節點新增或編輯旋轉動畫（支點、軸向、RPM 等），支援自動偵測
- **翅膀 Rigging**：半自動為鳥類／昆蟲類模型建立拍翅動畫，支援三種工作流程（見下方說明）
- **節點上色**：對選取節點套用純色或貼圖材質，可還原
- **匯出 GLB**：將目前場景（含動畫、骨骼蒙皮與材質修正）匯出為 `.glb` 檔下載

### 介面說明

| 區域 | 說明 |
|------|------|
| **頂部列** | 選擇模型、顯示目前版號 |
| **左側場景樹** | 節點階層、搜尋、展開/收合、選取節點 |
| **中央檢視區** | 3D 模型顯示與檢視工具列 |
| **右側檢視器** | 模型資訊、位置/旋轉、動畫、旋翼設定、翅膀 Rigging、上色、匯出 |

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

### 翅膀 Rigging

載入模型後，右側 **翅膀 Rigging** 面板會自動分析 mesh 結構，並依模型類型建議工作流程。此工具為**半自動** rigging，複雜拓樸或翅膀未展開的模型可能需要手動微調。

#### 三種工作流程

| 模式 | 適用情境 | 說明 |
|------|----------|------|
| **既有骨骼** | GLB 已含 SkinnedMesh 與骨骼 | 將模型既有骨骼對應到拍翅 preset 的驅動骨（至少需指定左右翅根部），直接套用動畫 |
| **Pivot 拍翅** | 左右翅為獨立 Mesh | 在翼根插入 pivot，以剛體旋轉模擬拍翅；無需 skin weight，適合快速驗證 |
| **完整 Rig** | 單一 Mesh 或需翅膀彎曲 | 在檢視區標記 6 個關鍵點（左右肩、中段、翅尖），自動建立骨骼、計算 skin weight 並轉為 SkinnedMesh |

#### 完整 Rig 操作流程

1. 選擇 **完整 Rig** 模式，指定第一個目標 Mesh
2. 點擊 **開始標記**，依序在 3D 檢視區點選 6 個翅膀關鍵點（可切換步驟、清除重標）
3. 點擊 **建立骨骼與權重**，系統會建立 `Armature` 階層、骨骼鏈與蒙皮
4. 可調整 **身體鎖定範圍**、**Falloff 比例**，開啟 **權重熱力圖** 預覽，或 **重新計算權重**
5. 選擇拍翅 **Preset**（`slow_flap`、`fast_flap`、`takeoff_flap`、`glide_idle`、`hover_flap`），調整速度、幅度、右翅鏡射與循環模式後套用
6. 透過 **匯出 GLB** 下載含骨骼、蒙皮與動畫的檔案

#### 多 Mesh 共用骨骼（Armature 同層）

完整 Rig 建立後，可將**其他尚未蒙皮的 Mesh**（例如身體 `body`）附加到同一套骨骼：

1. 在 **目標 Mesh** 下拉選單選取未綁定的 Mesh
2. 點擊 **套用蒙皮到此 Mesh**
3. 已蒙皮的 Mesh 會列於面板中；所有 SkinnedMesh 與骨骼同層掛在 `Armature` 下，共用同一動畫 clip

場景樹目標結構（與 glTF / Blender 慣例一致）：

```
Armature
├── SkinnedMesh: wings
├── SkinnedMesh: body
└── Bone: BirdRoot
    ├── L_Wing_01_Shoulder → L_Wing_02_Mid → L_Wing_03_Tip
    └── R_Wing_01_Shoulder → R_Wing_02_Mid → R_Wing_03_Tip
```

若 GLB 原本已有 `Armature` 節點，工具會自動沿用，不另建容器。

#### 注意事項

- 建議使用**翅膀展開**的模型；分析結果中的黃色警告請留意
- Pivot 模式僅整片剛體旋轉，無法產生翅尖漸進彎曲
- 身翅拓樸相連時，肩根部可能出現變形撕裂，可縮小身體鎖定範圍
- 匯出後建議在目標平台（如遊戲引擎）再次驗證動畫與蒙皮

### 匯出

1. 在右側 **匯出 GLB** 區塊確認檔名
2. 點擊 **下載 GLB**，瀏覽器會下載處理後的模型檔

> 匯出時會自動修正玻璃材質等相容性問題，並保留已設定的動畫、骨骼與 skin weight。

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

### 翅膀 Rigging 模組

核心邏輯位於 `src/lib/wing-rigging/`：

| 模組 | 說明 |
|------|------|
| `analyzeBirdModel.ts` | 分析 mesh 結構、左右翅候選、建議模式與警告 |
| `buildBirdSkeleton.ts` | 6 點標記 → 骨骼階層 |
| `computeWingSkinWeights.ts` | 投影主軸策略計算 skin weight |
| `convertToSkinnedMesh.ts` | Mesh → SkinnedMesh（骨骼掛於 Armature，延後 bind） |
| `resolveArmatureContainer.ts` | 偵測／建立 glTF 標準 Armature 容器 |
| `applyWingRig.ts` | 拆分骨骼建立（`createWingSkeleton`）與多 mesh 蒙皮（`bindMeshToWingSkeleton`） |
| `wingFlapPresets.ts` / `presetToClip.ts` | 五組拍翅 preset → `AnimationClip` |
| `createFlapClipForPivot.ts` | Pivot 快速拍翅模式 |

UI 元件：`WingRiggingPanel.vue`（整合於 `ModelInspector.vue`），狀態與預覽由 `useGlbViewer.ts` 管理。

## 授權

本專案為私有專案（`private: true`）。如需對外發布或調整授權，請依專案需求自行設定。
