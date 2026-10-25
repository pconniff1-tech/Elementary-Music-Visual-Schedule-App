const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    grade_level TEXT
);

CREATE TABLE IF NOT EXISTS image_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image_filename TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    activity_title TEXT NOT NULL,
    image_id INTEGER,
    external_url TEXT,
    FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    FOREIGN KEY(image_id) REFERENCES image_library(id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule
    ON schedule_items(schedule_id, position);
`;

function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  const statements = {
    listSchedules: db.prepare('SELECT id, name, grade_level FROM schedules ORDER BY name COLLATE NOCASE'),
    getSchedule: db.prepare('SELECT id, name, grade_level FROM schedules WHERE id = ?'),
    insertSchedule: db.prepare('INSERT INTO schedules (name, grade_level) VALUES (?, ?)'),
    updateSchedule: db.prepare('UPDATE schedules SET name = ?, grade_level = ? WHERE id = ?'),
    deleteSchedule: db.prepare('DELETE FROM schedules WHERE id = ?'),
    listItems: db.prepare(`
      SELECT si.id, si.position, si.activity_title, si.image_id, si.external_url,
             il.image_filename
      FROM schedule_items si
      LEFT JOIN image_library il ON il.id = si.image_id
      WHERE si.schedule_id = ?
      ORDER BY si.position`),
    deleteItems: db.prepare('DELETE FROM schedule_items WHERE schedule_id = ?'),
    insertItem: db.prepare(`
      INSERT INTO schedule_items (schedule_id, position, activity_title, image_id, external_url)
      VALUES (?, ?, ?, ?, ?)`),
    listImages: db.prepare('SELECT id, title, image_filename FROM image_library ORDER BY title COLLATE NOCASE'),
    getImage: db.prepare('SELECT id FROM image_library WHERE id = ?'),
    insertImage: db.prepare('INSERT INTO image_library (title, image_filename) VALUES (?, ?)')
  };

  function cleanText(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  const saveItems = db.transaction((scheduleId, items) => {
    statements.deleteItems.run(scheduleId);
    items.forEach((item, index) => {
      const title = cleanText(item.activity_title, 100) || `Step ${index + 1}`;
      const imageId = Number.isInteger(item.image_id) && statements.getImage.get(item.image_id) ? item.image_id : null;
      const url = cleanText(item.external_url, 2000);
      statements.insertItem.run(scheduleId, index, title, imageId, url || null);
    });
    return statements.listItems.all(scheduleId);
  });

  return {
    close: () => db.close(),

    listSchedules: () => statements.listSchedules.all(),

    createSchedule(name, gradeLevel) {
      const cleanName = cleanText(name, 100);
      if (!cleanName) throw new Error('A class name is required.');
      const info = statements.insertSchedule.run(cleanName, cleanText(gradeLevel, 50) || null);
      return statements.getSchedule.get(info.lastInsertRowid);
    },

    updateSchedule(id, name, gradeLevel) {
      const cleanName = cleanText(name, 100);
      if (!cleanName) throw new Error('A class name is required.');
      statements.updateSchedule.run(cleanName, cleanText(gradeLevel, 50) || null, id);
      return statements.getSchedule.get(id);
    },

    deleteSchedule: (id) => statements.deleteSchedule.run(id).changes > 0,

    getItems: (scheduleId) => statements.listItems.all(scheduleId),

    saveItems(scheduleId, items) {
      if (!statements.getSchedule.get(scheduleId)) throw new Error('Schedule not found.');
      if (!Array.isArray(items)) throw new Error('Invalid steps.');
      return saveItems(scheduleId, items);
    },

    listImages: () => statements.listImages.all(),

    addImage(title, filename) {
      const cleanTitle = cleanText(title, 100) || filename;
      const info = statements.insertImage.run(cleanTitle, filename);
      return { id: Number(info.lastInsertRowid), title: cleanTitle, image_filename: filename };
    }
  };
}

module.exports = { createDb };
