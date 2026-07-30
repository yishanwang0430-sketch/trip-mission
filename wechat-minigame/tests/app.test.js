const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildHiddenMission,
  buildMissionBatch,
  drawAvailability,
  normalizePlayerName,
  validateBountyTask,
  validateHiddenTask,
} = require("../src/app");
const { localTextAllowed } = require("../src/content-security");

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

test("bounty editor enforces length and safety boundaries", () => {
  assert.equal(validateBountyTask("率先让三位同行一起说出发").value, "率先让三位同行一起说出发");
  assert.match(validateBountyTask("让同行交出手机密码").error, /安全|隐私/);
  assert.match(validateBountyTask("太短").error, /8–100/);
});

test("local content policy blocks prohibited or private text", () => {
  assert.equal(localTextAllowed("小王同学"), true);
  assert.equal(localTextAllowed("请把手机号发给我"), false);
  assert.equal(localTextAllowed("普通\n昵称"), false);
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
  assert.equal(mission.revealed, true);
  assert.equal(mission.expiresAt - mission.drawnAt, 2 * 60 * 60 * 1000);
});

test("a round draws three revealed missions with one shared timer and batch id", () => {
  const now = 1785300000000;
  const batch = buildMissionBatch({
    players: [
      { id: "self", seat: 1, name: "小王" },
      { id: "p2", seat: 2, name: "Mars" },
      { id: "p3", seat: 3, name: "小满" },
    ],
    selfId: "self",
    roundNumber: 2,
    now,
    random: () => 0.2,
  });

  assert.equal(batch.length, 3);
  assert.equal(new Set(batch.map((task) => task.uid)).size, 3);
  assert.equal(new Set(batch.map((task) => task.batchId)).size, 1);
  assert.deepEqual(batch.map((task) => task.batchOrder), [1, 2, 3]);
  assert.ok(batch.every((task) => task.revealed && task.roundNumber === 2));
  assert.ok(batch.every((task) => task.drawnAt === now && task.expiresAt === now + 2 * 60 * 60 * 1000));
});

test("three-task batches consume one slot and each slot restores after six hours", () => {
  const now = 1785300000000;
  const sixHours = 6 * 60 * 60 * 1000;
  const state = drawAvailability({
    now,
    history: [
      { uid: "expired", drawnAt: now - sixHours - 1 },
      { uid: "first-1", batchId: "batch-1", drawnAt: now - 5 * 60 * 60 * 1000 },
      { uid: "first-2", batchId: "batch-1", drawnAt: now - 5 * 60 * 60 * 1000 },
      { uid: "second", batchId: "batch-2", drawnAt: now - 2 * 60 * 60 * 1000 },
    ],
    activeTasks: [
      { uid: "active-1", batchId: "batch-3", drawnAt: now - 60 * 60 * 1000 },
      { uid: "active-2", batchId: "batch-3", drawnAt: now - 60 * 60 * 1000 },
    ],
  });

  assert.equal(state.used, 3);
  assert.equal(state.remaining, 0);
  assert.equal(state.nextRefreshAt, now + 60 * 60 * 1000);

  const restored = drawAvailability({
    now: now + 60 * 60 * 1000,
    history: [
      { uid: "first", batchId: "batch-1", drawnAt: now - 5 * 60 * 60 * 1000 },
      { uid: "second", batchId: "batch-2", drawnAt: now - 2 * 60 * 60 * 1000 },
      { uid: "active", batchId: "batch-3", drawnAt: now - 60 * 60 * 1000 },
    ],
  });
  assert.equal(restored.used, 2);
  assert.equal(restored.remaining, 1);
});
