const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHiddenMission, drawAvailability, normalizePlayerName, validateHiddenTask } = require("../src/app");

test("player names are custom, trimmed and limited to 12 characters", () => {
  assert.equal(normalizePlayerName("  小王  "), "小王");
  assert.equal(normalizePlayerName("Mars-7"), "Mars-7");
  assert.equal(normalizePlayerName("一二三四五六七八九十甲乙"), "一二三四五六七八九十甲乙");
  assert.equal(normalizePlayerName(""), null);
  assert.equal(normalizePlayerName("1234567890123"), null);
  assert.equal(normalizePlayerName("小王\n队长"), null);
});

test("hidden task editor enforces length and safety boundaries", () => {
  assert.equal(validateHiddenTask("  让任意同行主动提议拍一张合照  ").value, "让任意同行主动提议拍一张合照");
  assert.match(validateHiddenTask("让同行交出手机密码").error, /安全|隐私/);
  assert.match(validateHiddenTask("太短").error, /8–80/);
});

test("server hidden task becomes a local locked mission", () => {
  const mission = buildHiddenMission({
    uid: "hidden-room-1",
    taskId: "X01",
    code: "X01-ABC",
    score: 3,
    targetName: "本轮隐藏任务",
    description: "让任意同行主动提议拍一张合照。",
  }, 1785300000000);

  assert.equal(mission.isHidden, true);
  assert.equal(mission.score, 3);
  assert.equal(mission.revealed, false);
  assert.equal(mission.expiresAt - mission.drawnAt, 2 * 60 * 60 * 1000);
});

test("draw quota keeps three slots and restores each slot after six hours", () => {
  const now = 1785300000000;
  const sixHours = 6 * 60 * 60 * 1000;
  const state = drawAvailability({
    now,
    history: [
      { uid: "expired", drawnAt: now - sixHours - 1 },
      { uid: "first", drawnAt: now - 5 * 60 * 60 * 1000 },
      { uid: "second", drawnAt: now - 2 * 60 * 60 * 1000 },
    ],
    activeTask: { uid: "active", drawnAt: now - 60 * 60 * 1000 },
  });

  assert.equal(state.used, 3);
  assert.equal(state.remaining, 0);
  assert.equal(state.nextRefreshAt, now + 60 * 60 * 1000);

  const restored = drawAvailability({
    now: now + 60 * 60 * 1000,
    history: [
      { uid: "first", drawnAt: now - 5 * 60 * 60 * 1000 },
      { uid: "second", drawnAt: now - 2 * 60 * 60 * 1000 },
      { uid: "active", drawnAt: now - 60 * 60 * 1000 },
    ],
  });
  assert.equal(restored.used, 2);
  assert.equal(restored.remaining, 1);
});
