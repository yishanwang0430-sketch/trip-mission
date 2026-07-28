const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePlayerName } = require("../src/app");

test("player names are custom, trimmed and limited to 12 characters", () => {
  assert.equal(normalizePlayerName("  小王  "), "小王");
  assert.equal(normalizePlayerName("Mars-7"), "Mars-7");
  assert.equal(normalizePlayerName("一二三四五六七八九十甲乙"), "一二三四五六七八九十甲乙");
  assert.equal(normalizePlayerName(""), null);
  assert.equal(normalizePlayerName("1234567890123"), null);
  assert.equal(normalizePlayerName("小王\n队长"), null);
});
