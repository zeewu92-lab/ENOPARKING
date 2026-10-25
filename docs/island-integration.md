# 島嶼（語未央花園）接入說明

資料流（遵守「Garden 隔離原則」，島嶼只消費、不回寫學習算法）：

Learning Event → Algorithm → Seed Ledger →（收取）→ Garden State → Island

- `src/features/island/islandHost.js`：島嶼與產品資料之間的唯一介面。貨幣、樹成長、種子收取、裝飾存檔都在這裡。
- `src/features/island/island.js`：Three.js 場景與全屏裝飾介面（框架無關，`mountIsland(slot, { THREE, OrbitControls, host })`）。
- `src/features/island/IslandCard.jsx`：React 包裝，HomePage 以 `React.lazy` 載入。
- 貨幣名稱集中在 `islandHost.js` 的 `CURRENCY_NAME`。
- 裝飾存檔：`engnocrazy:islandDecor`，隨既有雲端同步一起走。
- 商店消費只扣 `petals`，不動 `tree.growth`。島嶼等級 = 樹階段 + 1。
- 商品價格在 `island.js` 的 `商品表`。
