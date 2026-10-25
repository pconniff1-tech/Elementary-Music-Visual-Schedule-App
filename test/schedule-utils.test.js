const test = require('node:test');
const assert = require('node:assert');
const { formatPresentationUrl, getAudioStreamUrl } = require('../src/renderer/schedule-utils');
const audioProxy = 'http://127.0.0.1:45678/audio/test-token';

test('Google Slides edit links become embed links', () => {
  assert.strictEqual(
    formatPresentationUrl('https://docs.google.com/presentation/d/abc123/edit#slide=id.p'),
    'https://docs.google.com/presentation/d/abc123/embed?start=false&loop=false&delayms=3000'
  );
});

test('Canva design links get embed', () => {
  assert.strictEqual(
    formatPresentationUrl('https://www.canva.com/design/DAF123/abc/view?utm=x'),
    'https://www.canva.com/design/DAF123/abc/view?embed'
  );
});

test('non-web and empty URLs are rejected', () => {
  assert.strictEqual(formatPresentationUrl(''), '');
  assert.strictEqual(formatPresentationUrl('javascript:alert(1)'), '');
  assert.strictEqual(formatPresentationUrl('file:///c:/x'), '');
});

test('plain URLs pass through and bare domains get https', () => {
  assert.strictEqual(formatPresentationUrl('https://example.com/a'), 'https://example.com/a');
  assert.strictEqual(formatPresentationUrl('example.com/a'), 'https://example.com/a');
});

test('direct audio file URLs are recognized with query strings', () => {
  assert.strictEqual(
    getAudioStreamUrl('https://media.example.com/class-song.mp3?download=1'),
    'https://media.example.com/class-song.mp3?download=1'
  );
});

test('Google Drive audio activities use a direct stream URL', () => {
  assert.strictEqual(
    getAudioStreamUrl('https://drive.google.com/file/d/Abc_123/view?usp=sharing', audioProxy),
    'http://127.0.0.1:45678/audio/test-token/Abc_123'
  );
  assert.strictEqual(
    getAudioStreamUrl('https://drive.google.com/open?id=Abc_123', audioProxy),
    'http://127.0.0.1:45678/audio/test-token/Abc_123'
  );
});

test('Drive resourcekey is preserved in the stream URL', () => {
  assert.strictEqual(
    getAudioStreamUrl('https://drive.google.com/file/d/0B6J_x-Dg/view?usp=sharing&resourcekey=0-w9CQ_o-g', audioProxy),
    'http://127.0.0.1:45678/audio/test-token/0B6J_x-Dg?resourcekey=0-w9CQ_o-g'
  );
});

test('Drive file links stream as audio regardless of title; unsafe schemes and folders do not', () => {
  assert.strictEqual(
    getAudioStreamUrl('https://drive.google.com/file/d/Abc_123/view', audioProxy),
    'http://127.0.0.1:45678/audio/test-token/Abc_123'
  );
  assert.strictEqual(getAudioStreamUrl('https://drive.google.com/drive/folders/xyz'), '');
  assert.strictEqual(getAudioStreamUrl('javascript:alert(1)', 'Song'), '');
});
