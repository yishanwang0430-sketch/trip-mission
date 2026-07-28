const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function makeHarness() {
  const calls = [];
  const room = {
    roomId: "11111111-1111-4111-8111-111111111111",
    roomCode: "654321",
    self: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seat: "A", name: "小王" },
    players: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seat: "A", name: "小王", totalScore: 0, attendanceDays: 0 },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", seat: "B", name: "小李", totalScore: 2, attendanceDays: 1 },
    ],
  };
  const presence = {
    A: [{ playerId: room.players[0].id }],
    B: [{ playerId: room.players[1].id }],
  };
  const fakeChannel = {
    state: "joined",
    handlers: [],
    on(type, filter, handler) {
      this.handlers.push({ type, filter, handler });
      return this;
    },
    subscribe(handler) {
      queueMicrotask(() => handler("SUBSCRIBED"));
      return this;
    },
    async track() {},
    async send() {},
    presenceState() {
      return presence;
    },
  };
  const fakeClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (["create_trip_room", "join_trip_room", "get_trip_room"].includes(name)) return { data: room, error: null };
      if (name === "get_trip_reviews") {
        return { data: [{ seat: "A", name: "小王", bonus: true, note: "今天很顺利", reviewed: true }], error: null };
      }
      return { data: true, error: null };
    },
    channel() {
      return fakeChannel;
    },
    async removeChannel() {},
  };
  const storage = new MemoryStorage();
  const window = {
    TRIP_SUPABASE: { url: "https://example.supabase.co", anonKey: "x".repeat(80) },
    supabase: { createClient: () => fakeClient },
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    window,
    localStorage: storage,
    location: { href: "https://example.com/trip/?source=test" },
    crypto,
    URL,
    JSON,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    setInterval,
    clearInterval,
    queueMicrotask,
    console,
  });
  vm.runInContext(fs.readFileSync("room.js", "utf8"), context);
  return { manager: window.tripRooms, calls, room };
}

test("creates a room and exposes realtime roster state", async () => {
  const { manager } = makeHarness();
  await manager.init();
  await manager.createRoom("小王");
  await new Promise((resolve) => setImmediate(resolve));
  const state = manager.snapshot();
  assert.equal(state.connected, true);
  assert.equal(state.session.roomCode, "654321");
  assert.equal(state.players.length, 2);
  assert.equal(
    JSON.stringify(Array.from(state.onlinePlayerIds).sort()),
    JSON.stringify(Array.from(state.players, (player) => player.id).sort()),
  );
  assert.equal(manager.inviteUrl(), "https://example.com/trip/?room=654321");
  await manager.leaveRoom();
});

test("sends idempotent score, attendance, review and name RPCs", async () => {
  const { manager, calls, room } = makeHarness();
  await manager.init();
  await manager.createRoom("小王");
  await new Promise((resolve) => setImmediate(resolve));
  await manager.recordTask({
    uid: "mission-unique-1",
    code: "L01-123",
    taskId: "L01",
    score: 1,
    targetName: "B · 小李",
    note: "",
    dateKey: "2026-07-28",
  }, "B");
  await manager.setAttendance("2026-07-28", true);
  await manager.saveReview("2026-07-28", { bonus: true, note: "今天很顺利", reviewed: true });
  const reviews = await manager.loadReviews("2026-07-28");
  await manager.updateName("新名字");

  const scoreCall = calls.find((call) => call.name === "record_trip_score");
  assert.equal(scoreCall.params.p_task_uid, "mission-unique-1");
  assert.equal(scoreCall.params.p_witness_id, room.players[1].id);
  assert.ok(calls.some((call) => call.name === "set_trip_attendance"));
  assert.ok(calls.some((call) => call.name === "save_trip_review"));
  assert.ok(calls.some((call) => call.name === "update_trip_name"));
  assert.equal(reviews[0].bonus, true);
  await manager.leaveRoom();
});
