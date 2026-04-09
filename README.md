# Notion Style Markdown Notes

一个简洁的记事本应用，支持 URL 区分笔记、自动保存到 SQLite、Notion 风格块编辑和斜杠命令。

## 功能特性

- URL 区分笔记
  - `/abc` 对应笔记 `abc`
  - `/def` 对应笔记 `def`
- 自动保存
  - 输入后自动防抖保存，无需手动点击保存
- Notion 风格块编辑
  - 首行空时显示提示：`从这里开始`
  - 块级编辑（标题、列表、引用、代码块、分割线）
- 斜杠命令
  - 输入 `/` 打开命令菜单
  - 支持键盘 `↑/↓` 选择、`Enter/Tab` 确认、`Esc` 关闭
- Markdown 快速输入回车转换
  - `# 标题` -> 一级标题
  - `## 标题` -> 二级标题
  - `### 标题` -> 三级标题
  - `- 项` / `* 项` -> 无序列表
  - `1. 项` -> 有序列表
  - `> 引用` -> 引用块
  - ````` -> 代码块
  - `---` / `***` -> 分割线

## 技术栈

- 前端：原生 HTML/CSS/JavaScript（`contenteditable`）
- 后端：Node.js + Express
- 存储：SQLite（`notes.db`）

## 目录结构

```text
.
├─ public/
│  ├─ app.js
│  ├─ index.html
│  └─ style.css
├─ server.js
├─ package.json
└─ .gitignore
```

## 本地运行

```bash
npm install
npm start
```

默认端口 `3000`，若端口占用：

```bash
# Windows
set PORT=3210&& npm start
```

## API

### 读取笔记

- `GET /api/notes/:id`

示例响应：

```json
{
  "id": "abc",
  "content": "<p>Hello</p>",
  "updated_at": "2026-04-09 10:00:00"
}
```

### 保存笔记

- `PUT /api/notes/:id`
- Body:

```json
{
  "content": "<h1>Title</h1><p>text</p>"
}
```

## 数据说明

- 数据库存储文件：`notes.db`
- 表：`notes`
  - `id`：笔记 ID（主键）
  - `content`：富文本内容（HTML）
  - `updated_at`：更新时间

## 交互说明

- 首行提示策略：只要第一行为空，就显示“从这里开始”，即使后续行已有内容。
- 非段落块回车行为：
  - 标题/引用/代码块按回车 -> 新建下一行普通段落
  - 列表项按回车：非空新建下一项，空项退出列表

## 许可证

MIT
