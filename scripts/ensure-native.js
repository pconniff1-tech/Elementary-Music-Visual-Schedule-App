// Dual-arch builds leave better-sqlite3 compiled for the last target (arm64).
// Rebuild it for this machine's architecture if the binary doesn't match.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MACHINES = { 0x8664: 'x64', 0xaa64: 'arm64' };
const binary = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

const getBinaryArch = () => {
  try {
    const buf = fs.readFileSync(binary);
    const peOffset = buf.readUInt32LE(0x3c);
    return MACHINES[buf.readUInt16LE(peOffset + 4)] || 'unknown';
  } catch {
    return 'missing';
  }
};

const current = getBinaryArch();
if (current === process.arch) {
  console.log(`better-sqlite3 already built for ${current}.`);
  process.exit(0);
}

console.log(`better-sqlite3 is ${current}; rebuilding for ${process.arch}...`);
const result = spawnSync('npx electron-builder install-app-deps', { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
