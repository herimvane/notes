const editor = document.getElementById("editor");
const slashMenu = document.getElementById("slashMenu");

let saveTimer = null;
let isSaving = false;
let queuedSave = false;
let slashItems = [];
let slashActiveIndex = 0;

const noteId = (() => {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  return path ? decodeURIComponent(path) : "default";
})();

const commands = [
  { key: "text", label: "Text", hint: "普通文本", type: "p" },
  { key: "h1", label: "Heading 1", hint: "一级标题", type: "h1" },
  { key: "h2", label: "Heading 2", hint: "二级标题", type: "h2" },
  { key: "h3", label: "Heading 3", hint: "三级标题", type: "h3" },
  { key: "bullet", label: "Bulleted List", hint: "无序列表", type: "ul" },
  { key: "number", label: "Numbered List", hint: "有序列表", type: "ol" },
  { key: "quote", label: "Quote", hint: "引用", type: "blockquote" },
  { key: "code", label: "Code Block", hint: "代码块", type: "pre" },
  { key: "divider", label: "Divider", hint: "分割线", type: "hr" }
];

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function setBlockText(el, text) {
  el.innerHTML = "";
  if (text && text.length > 0) {
    el.textContent = text;
  } else {
    el.appendChild(document.createElement("br"));
  }
}

function createParagraph() {
  const p = document.createElement("p");
  p.appendChild(document.createElement("br"));
  return p;
}

function getCurrentTopBlock() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;

  let node = sel.anchorNode;
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node) return null;
  if (node === editor) return editor.lastElementChild;

  while (node && node.parentElement !== editor) {
    node = node.parentElement;
  }
  return node;
}

function firstLineHasNoInput(block) {
  if (!block) return true;

  if (block.tagName === "HR") return false;

  if (block.tagName === "UL" || block.tagName === "OL") {
    const lis = Array.from(block.querySelectorAll("li"));
    return lis.length === 0 || lis.every((li) => li.textContent.replace(/\u200B/g, "").trim().length === 0);
  }

  return block.textContent.replace(/\u200B/g, "").trim().length === 0;
}

function updateEmptyState() {
  Array.from(editor.children).forEach((el) => el.classList.remove("first-line-hint"));
  const first = editor.firstElementChild;
  if (!first) return;

  if (firstLineHasNoInput(first)) {
    first.classList.add("first-line-hint");
    first.setAttribute("data-placeholder", editor.dataset.placeholder || "从这里开始");
  }
}

function ensureInitialBlock() {
  if (editor.childElementCount === 0) {
    const p = createParagraph();
    editor.appendChild(p);
    placeCaretAtEnd(p);
  }
}

function isTopBlockEmpty(block) {
  if (!block) return true;

  if (block.tagName === "UL" || block.tagName === "OL") {
    const lis = Array.from(block.querySelectorAll("li"));
    return lis.length === 0 || lis.every((li) => li.textContent.trim().length === 0);
  }

  if (block.tagName === "HR") return true;
  return block.textContent.replace(/\u200B/g, "").trim().length === 0;
}

function isCaretAtStartOf(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;

  const current = sel.getRangeAt(0);
  const probe = current.cloneRange();
  probe.selectNodeContents(el);
  probe.setEnd(current.endContainer, current.endOffset);

  const before = probe.toString().replace(/\u200B/g, "");
  return before.length === 0;
}

function replaceCurrentBlock(tagName, textContent = "", options = {}) {
  const { placeCaret = "current", appendParagraph = false } = options;
  const block = getCurrentTopBlock();
  if (!block || !editor.contains(block)) return;

  let newBlock = null;
  let focusTarget = null;

  if (tagName === "hr") {
    newBlock = document.createElement("hr");
    block.replaceWith(newBlock);

    const next = createParagraph();
    newBlock.insertAdjacentElement("afterend", next);
    focusTarget = next;
  } else if (tagName === "ul" || tagName === "ol") {
    newBlock = document.createElement(tagName);
    const li = document.createElement("li");
    setBlockText(li, textContent);
    newBlock.appendChild(li);
    block.replaceWith(newBlock);
    focusTarget = li;
  } else if (tagName === "pre") {
    newBlock = document.createElement("pre");
    const code = document.createElement("code");
    setBlockText(code, textContent);
    newBlock.appendChild(code);
    block.replaceWith(newBlock);
    focusTarget = code;
  } else {
    newBlock = document.createElement(tagName);
    setBlockText(newBlock, textContent);
    block.replaceWith(newBlock);
    focusTarget = newBlock;
  }

  if (appendParagraph && tagName !== "hr") {
    const next = createParagraph();
    newBlock.insertAdjacentElement("afterend", next);
    focusTarget = placeCaret === "next" ? next : focusTarget;
  }

  placeCaretAtEnd(focusTarget || newBlock);
  updateEmptyState();
  scheduleSave();
}

function parseMarkdownLine(text) {
  const t = text.replace(/\u00a0/g, " ").trim();
  if (!t) return null;

  let m = t.match(/^###\s+(.*)$/);
  if (m) return { tag: "h3", content: m[1] };

  m = t.match(/^##\s+(.*)$/);
  if (m) return { tag: "h2", content: m[1] };

  m = t.match(/^#\s+(.*)$/);
  if (m) return { tag: "h1", content: m[1] };

  m = t.match(/^[-*]\s+(.*)$/);
  if (m) return { tag: "ul", content: m[1] };

  m = t.match(/^\d+\.\s+(.*)$/);
  if (m) return { tag: "ol", content: m[1] };

  m = t.match(/^>\s+(.*)$/);
  if (m) return { tag: "blockquote", content: m[1] };

  if (t === "---" || t === "***") return { tag: "hr", content: "" };
  if (t === "```") return { tag: "pre", content: "" };

  return null;
}

function applyEnterMarkdownTransform() {
  const block = getCurrentTopBlock();
  if (!block || block.tagName !== "P") return false;

  const parsed = parseMarkdownLine(block.textContent || "");
  if (!parsed) return false;

  replaceCurrentBlock(parsed.tag, parsed.content, { placeCaret: "next", appendParagraph: true });
  hideSlashMenu();
  return true;
}

function maybeNormalizeOnBackspace() {
  const block = getCurrentTopBlock();
  if (!block || !editor.contains(block)) return false;

  const nonParagraph = ["H1", "H2", "H3", "BLOCKQUOTE", "PRE", "UL", "OL"];
  if (!nonParagraph.includes(block.tagName)) return false;
  if (!isTopBlockEmpty(block)) return false;
  if (!isCaretAtStartOf(block)) return false;

  replaceCurrentBlock("p", "", { placeCaret: "current", appendParagraph: false });
  return true;
}

function getClosestListItemFromSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node || !node.closest) return null;
  return node.closest("li");
}

function handleEnterOnStructuredBlock() {
  const block = getCurrentTopBlock();
  if (!block || block.tagName === "P") return false;

  if (block.tagName === "UL" || block.tagName === "OL") {
    const li = getClosestListItemFromSelection();
    if (!li || !block.contains(li)) return false;

    const liText = li.textContent.replace(/\u200B/g, "").trim();
    if (liText.length === 0) {
      li.remove();
      const remaining = block.querySelector("li");
      const p = createParagraph();
      block.insertAdjacentElement("afterend", p);
      if (!remaining) block.remove();
      placeCaretAtEnd(p);
      updateEmptyState();
      scheduleSave();
      return true;
    }

    const newLi = document.createElement("li");
    newLi.appendChild(document.createElement("br"));
    li.insertAdjacentElement("afterend", newLi);
    placeCaretAtEnd(newLi);
    updateEmptyState();
    scheduleSave();
    return true;
  }

  const p = createParagraph();
  block.insertAdjacentElement("afterend", p);
  placeCaretAtEnd(p);
  updateEmptyState();
  scheduleSave();
  return true;
}

function getCurrentSlashQuery() {
  const block = getCurrentTopBlock();
  if (!block || block.tagName !== "P") return null;

  const text = block.textContent.trim();
  const match = text.match(/^\/([^\s]*)$/);
  if (!match) return null;
  return match[1].toLowerCase();
}

function hideSlashMenu() {
  slashItems = [];
  slashActiveIndex = 0;
  slashMenu.innerHTML = "";
  slashMenu.classList.add("hidden");
}

function positionSlashMenu() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const range = sel.getRangeAt(0).cloneRange();
  const rect = range.getBoundingClientRect();
  const top = rect.bottom && rect.top ? rect.bottom + 8 : 130;
  const left = rect.left || 30;

  slashMenu.style.top = `${Math.min(top, window.innerHeight - 320)}px`;
  slashMenu.style.left = `${Math.min(left, window.innerWidth - 300)}px`;
}

function renderSlashMenu(items) {
  if (items.length === 0) {
    hideSlashMenu();
    return;
  }

  slashMenu.innerHTML = items
    .map((item, idx) => {
      const active = idx === slashActiveIndex ? "active" : "";
      return `<button class="slash-item ${active}" data-key="${item.key}">${item.label}<small>${item.hint}</small></button>`;
    })
    .join("");

  slashMenu.classList.remove("hidden");
  positionSlashMenu();
}

function updateSlashMenu() {
  const query = getCurrentSlashQuery();
  if (query === null) {
    hideSlashMenu();
    return;
  }

  slashItems = commands.filter((item) => {
    if (!query) return true;
    return item.key.includes(query) || item.label.toLowerCase().includes(query) || item.hint.includes(query);
  });

  slashActiveIndex = Math.min(slashActiveIndex, Math.max(slashItems.length - 1, 0));
  renderSlashMenu(slashItems);
}

function applySlashCommand(item) {
  const tagMap = {
    text: "p",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    bullet: "ul",
    number: "ol",
    quote: "blockquote",
    code: "pre",
    divider: "hr"
  };

  const tag = tagMap[item.key] || "p";
  const append = tag === "hr";
  replaceCurrentBlock(tag, "", { placeCaret: "current", appendParagraph: append });
  hideSlashMenu();
}

async function loadNote() {
  const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`);
  const data = await res.json();
  const raw = (data.content || "").trim();
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  editor.innerHTML = raw ? (looksLikeHtml ? raw : marked.parse(raw)) : "";
  ensureInitialBlock();
  updateEmptyState();
}

async function saveNoteNow() {
  if (isSaving) {
    queuedSave = true;
    return;
  }

  isSaving = true;
  try {
    await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editor.innerHTML })
    });
  } finally {
    isSaving = false;
    if (queuedSave) {
      queuedSave = false;
      saveNoteNow();
    }
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNoteNow, 350);
}

editor.addEventListener("input", () => {
  ensureInitialBlock();
  updateEmptyState();
  updateSlashMenu();
  scheduleSave();
});

editor.addEventListener("keydown", (e) => {
  if (!slashMenu.classList.contains("hidden")) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      slashActiveIndex = (slashActiveIndex + 1) % slashItems.length;
      renderSlashMenu(slashItems);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      slashActiveIndex = (slashActiveIndex - 1 + slashItems.length) % slashItems.length;
      renderSlashMenu(slashItems);
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const selected = slashItems[slashActiveIndex];
      if (selected) applySlashCommand(selected);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      hideSlashMenu();
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    const transformed = applyEnterMarkdownTransform();
    if (transformed) {
      e.preventDefault();
      return;
    }

    const moved = handleEnterOnStructuredBlock();
    if (moved) {
      e.preventDefault();
      return;
    }
  }

  if (e.key === "Backspace") {
    const normalized = maybeNormalizeOnBackspace();
    if (normalized) {
      e.preventDefault();
    }
  }
});

editor.addEventListener("click", updateSlashMenu);
editor.addEventListener("keyup", () => {
  updateEmptyState();
  updateSlashMenu();
});

slashMenu.addEventListener("mousedown", (e) => {
  e.preventDefault();
  const btn = e.target.closest("button[data-key]");
  if (!btn) return;
  const item = slashItems.find((entry) => entry.key === btn.dataset.key);
  if (item) applySlashCommand(item);
});

window.addEventListener("beforeunload", () => {
  clearTimeout(saveTimer);
});

window.addEventListener("resize", () => {
  if (!slashMenu.classList.contains("hidden")) positionSlashMenu();
});

(async () => {
  await loadNote();
  editor.focus();
})();
