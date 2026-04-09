const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "notes.db");

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/notes/:id", (req, res) => {
  const noteId = req.params.id;
  if (!noteId) {
    return res.status(400).json({ error: "Missing note id" });
  }

  db.get("SELECT id, content, updated_at FROM notes WHERE id = ?", [noteId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch note" });
    }
    if (!row) {
      return res.json({ id: noteId, content: "", updated_at: null });
    }
    return res.json(row);
  });
});

app.put("/api/notes/:id", (req, res) => {
  const noteId = req.params.id;
  const content = typeof req.body.content === "string" ? req.body.content : "";
  if (!noteId) {
    return res.status(400).json({ error: "Missing note id" });
  }

  db.run(
    `
      INSERT INTO notes (id, content, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
    `,
    [noteId, content],
    (err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to save note" });
      }
      return res.json({ ok: true, id: noteId });
    }
  );
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).end();
  }
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Notes app running at http://localhost:${PORT}`);
});
