// Runs under Electron's Node (ELECTRON_RUN_AS_NODE) because better-sqlite3 is built for Electron.
// Run with: npm run test:db
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDb } = require('../src/db');

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

assert.strictEqual(db.deleteSchedule(sched.id), true);
assert.strictEqual(db.getItems(sched.id).length, 0);
assert.strictEqual(db.listImages().length, 1);

db.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log('db tests passed');
