const test = require("node:test");
const assert = require("node:assert/strict");
const { TASKS, dateKey, drawMission } = require("../src/tasks");

function players(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, seat: index + 1, name: `玩家${index + 1}` }));
}

test("task library contains all three score tiers and supports dynamic groups", () => {
  assert.deepEqual([...new Set(TASKS.map((task) => task.score))].sort(), [1, 2, 3]);
  assert.ok(TASKS.every((task) => task.minPlayers >= 2 && task.minPlayers <= 4));
  assert.ok(TASKS.every((task) => (
    (task.id.startsWith("L") && task.score === 1)
    || (task.id.startsWith("M") && task.score === 2)
    || (task.id.startsWith("H") && task.score === 3)
  )));
  for (const count of [3, 4, 8, 12]) {
    const task = drawMission({ players: players(count), selfId: "p1", random: () => 0.2, now: 1785231000000 });
    assert.notEqual(task.targetId, "p1");
    assert.match(task.description, /玩家/);
    assert.equal(task.playedOn, dateKey(new Date(1785231000000)));
  }
});

test("draw avoids a recently used task when another task is available", () => {
  const first = drawMission({ players: players(4), selfId: "p1", random: () => 0, now: 1785231000000 });
  const second = drawMission({
    players: players(4),
    selfId: "p1",
    history: [{ taskId: first.taskId }],
    random: () => 0,
    now: 1785231001000,
  });
  assert.notEqual(second.taskId, first.taskId);
  assert.notEqual(second.uid, first.uid);
});

test("stores the selected daily words on the mission until the next draw", () => {
  const values = [0.5, 0.85, 0, 0, 0, 0, 0, 0];
  let index = 0;
  const task = drawMission({
    players: players(4),
    selfId: "p1",
    random: () => values[index++] ?? 0,
    now: 1785231000000,
  });

  assert.equal(task.taskId, "M09");
  assert.deepEqual(task.randomWords, ["随便", "等一下"]);
  assert.match(task.description, /随便/);
  assert.match(task.description, /等一下/);
  assert.deepEqual(JSON.parse(JSON.stringify(task)).randomWords, task.randomWords);
});
