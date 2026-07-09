# Changelog

本專案版號遵循語意化版本（SemVer）。版號以根 `package.json` 為單一來源，透過 `npm run version:patch|minor|major` 統一 bump 全 workspace。

## [Unreleased]

### Added
- **賽事成績匯入**：`2025 XYZ圍棋公開賽`（19 組、723 名棋手、1837 場對局）自 CSV 匯入本機 DB。
  - 新增官方成績表 `tournament_official_results`（名次／四項輔分／勝場／加賽／升段組）。
  - 冪等匯入腳本 `scripts/import-xyz-2025.mjs`（含對局對稱性與勝場數一致性驗證）。
  - 公開端點 `GET /api/public/tournaments/:id/official-results`（組別清單＋各組名次表＋各輪對局）。
  - 前台「各組戰績」頁 `/tournaments/[id]/results`，並於精彩回顧列表加入入口。
- **版本 bump 機制**：`scripts/bump-version.mjs` 與 `version:*` npm scripts，統一 monorepo 版號並維護本 CHANGELOG。

### Fixed
- 修正 `change-category` 代理路由的 `_lib` 相對路徑深度（型別錯誤）。
