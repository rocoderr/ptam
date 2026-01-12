# view/ site

本目录是面向 `GitHub Pages` 的**纯静态 HTML**站点工程：

- `view/scripts/` 从根目录两份“大 Markdown”生成章节/小节的 HTML 文件与目录数据
- GitHub Pages 直接托管静态文件，不做额外构建

## GitHub Pages

GitHub Pages 默认只支持 `/<repo>` 根目录或 `/docs` 目录。

二选一：

1. 把 `view/` 目录作为站点根目录（将其移动到仓库根或 `/docs`）
2. 或者在发布时把 `view/` 内容复制到 `/docs`（推荐保持 `view/` 作为源码目录）

## 本地预览

1. 在仓库根目录运行拆分脚本：
   - `node view/scripts/split_books.mjs`
2. 用任意静态服务器打开 `view/`：
   - `python3 -m http.server 8000`（在 `view/` 目录下）
   - 或者你常用的本地 server
