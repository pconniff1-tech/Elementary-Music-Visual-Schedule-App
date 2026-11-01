// Runs under Electron's Node (ELECTRON_RUN_AS_NODE) because better-sqlite3 is built for Electron.
// Run with: npm run test:db
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDb, migrate, MIGRATIONS, LATEST_VERSION } = require('../src/db');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvs-'));
const db = createDb(path.join(dir, 'test.db'));

const sched = db.createSchedule('  Group A ', '2nd');
assert.strictEqual(sched.name, 'Group A');
assert.throws(() => db.createSchedule('   ', ''));

const img = db.addImage('Drum', 'drum.png');
const saved = db.saveItems(sched.id, [
  { activity_title: 'Hello', image_id: img.id, external_url: 'https://example.com' },
  { activity_title: '', image_id: 9999, external_url: '' }
]);
assert.deepStrictEqual(saved.map((i) => i.position), [0, 1]);
assert.strictEqual(saved[0].image_filename, 'drum.png');
assert.strictEqual(saved[1].activity_title, 'Step 2');
assert.strictEqual(saved[1].image_id, null);

db.saveItems(sched.id, [{ activity_title: 'Only' }]);
assert.strictEqual(db.getItems(sched.id).length, 1);

assert.strictEqual(db.renameImage(img.id, '  Big Drum ').title, 'Big Drum');
assert.throws(() => db.renameImage(img.id, '  '));
db.saveItems(sched.id, [{ activity_title: 'Only', image_id: img.id }]);
assert.deepStrictEqual(db.getImageUsage(img.id).map((s) => s.name), ['Group A']);
assert.throws(() => db.deleteImage(img.id), /Group A/);
const spare = db.addImage('Spare', 'spare.png');
assert.strictEqual(db.deleteImage(spare.id).image_filename, 'spare.png');
assert.strictEqual(db.listImages().length, 1);
db.saveItems(sched.id, [{ activity_title: 'Only' }]);

assert.strictEqual(db.deleteSchedule(sched.id), true);
assert.strictEqual(db.getItems(sched.id).length, 0);
assert.strictEqual(db.listImages().length, 1);

db.close();

// Legacy 1.0.6 database (tables exist, user_version 0) keeps its data and adopts version 1.
const Database = require('better-sqlite3');
const legacyPath = path.join(dir, 'legacy.db');
const legacy = new Database(legacyPath);
legacy.exec(`
  CREATE TABLE schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, grade_level TEXT);
  CREATE TABLE image_library (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, image_filename TEXT NOT NULL);
  CREATE TABLE schedule_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, position INTEGER NOT NULL,
    activity_title TEXT NOT NULL, image_id INTEGER, external_url TEXT,
    FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    FOREIGN KEY(image_id) REFERENCES image_library(id));
  CREATE INDEX idx_schedule_items_schedule ON schedule_items(schedule_id, position);
  INSERT INTO schedules (name, grade_level) VALUES ('Old Class', 'K');
  INSERT INTO schedule_items (schedule_id, position, activity_title) VALUES (1, 0, 'Warmup');
`);
legacy.close();
const upgraded = createDb(legacyPath);
assert.strictEqual(upgraded.listSchedules()[0].name, 'Old Class');
assert.strictEqual(upgraded.getItems(1)[0].activity_title, 'Warmup');
upgraded.close();
const probe = new Database(legacyPath);
assert.strictEqual(probe.pragma('user_version', { simple: true }), LATEST_VERSION);

// Future migration: runs once, backs up first, and a failing migration rolls back fully.
const migrations = [
  ...MIGRATIONS,
  { version: LATEST_VERSION + 1, up: (d) => d.exec('ALTER TABLE schedules ADD COLUMN notes TEXT') }
];
migrate(probe, legacyPath, migrations);
assert.strictEqual(probe.pragma('user_version', { simple: true }), LATEST_VERSION + 1);
assert.ok(probe.prepare('SELECT notes FROM schedules').all().length === 1);
assert.ok(fs.existsSync(`${legacyPath}.pre-v${LATEST_VERSION + 1}.bak`));
migrate(probe, legacyPath, migrations); // no-op when already current

const broken = [
  ...migrations,
  { version: LATEST_VERSION + 2, up: (d) => { d.exec('ALTER TABLE schedules ADD COLUMN extra TEXT'); throw new Error('boom'); } }
];
assert.throws(() => migrate(probe, legacyPath, broken), /boom/);
assert.strictEqual(probe.pragma('user_version', { simple: true }), LATEST_VERSION + 1);
assert.throws(() => probe.prepare('SELECT extra FROM schedules'));

// Newer-than-known data is refused rather than silently misread.
assert.throws(() => migrate(probe, legacyPath, MIGRATIONS), /newer version/);
probe.close();

fs.rmSync(dir, { recursive: true, force: true });
console.log('db tests passed');
