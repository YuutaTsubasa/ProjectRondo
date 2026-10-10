# 白潮原野俯拍底圖

1. 在此工作目錄執行 `npm run dev`。
2. 開啟 `http://127.0.0.1:5173/tools/maps/bake-region.html`（若 Vite 使用其他埠，改成該埠）。
3. 按「生成俯拍地圖」。它使用與遊戲相同的 `createRegionScene`，排除主角、天空、雲與距離霧，停止物理／動畫；不讀写存檔。
4. 下載 PNG 與座標 JSON。生成期間請留在頁面，等顯示「生成完成」。
5. 在專案根目錄執行（若下載檔名有 `(1)`，使用實際路徑）：

```powershell
python tools/maps/install-region-map.py "$HOME/Downloads/white-tide-atlas.png" "$HOME/Downloads/white-tide-atlas.json"
```

安裝器檢查 PNG 尺寸、座標與方位，寫入 `public/maps/white-tide-atlas.png` 和 `src/content/regionAtlas.json`。SHA-256 會更新小地圖網址，避免沿用快取。PNG 保留原始俯拍顏色；遊戲 HUD 以灰藍色調顯示，玩家／追蹤標記仍即時更新。

建築或地形更動後重新生成；遊戲不額外運行俯拍相機。座標採 +Z 北、+X 東。右手座標系的俯拍相機在 PNG 匯出時水平翻轉，讓方位與動態標記一致。`regionAtlasCapture.test.ts` 驗證方位與等比例投影，並檢查已安裝底圖的尺寸與雜湊。

此頁是開發工具，不列入正式遊戲建置入口。生成頁顯示的是現有場景；區域外未建模的部分會保持背景色。
