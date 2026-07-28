const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const config = require("../src/config");

async function rpc(name, params) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${name}: ${JSON.stringify(data)}`);
  return data;
}

async function expectRpcError(name, params, code) {
  await assert.rejects(() => rpc(name, params), new RegExp(code));
}

async function run() {
  const [ownerToken, witnessToken, thirdToken] = [randomUUID(), randomUUID(), randomUUID()];
  const created = await rpc("create_secret_room", {
    p_name: "一山",
    p_device_token: ownerToken,
    p_max_players: 3,
  });
  const code = created.roomCode;
  let deleted = false;

  try {
    await rpc("join_secret_room", { p_room_code: code, p_name: "阿禾", p_device_token: witnessToken });
    const joined = await rpc("join_secret_room", { p_room_code: code, p_name: "小满", p_device_token: thirdToken });
    assert.equal(joined.players.length, 3);

    const started = await rpc("start_secret_room", { p_room_code: code, p_device_token: ownerToken });
    assert.equal(started.status, "playing");
    const witness = started.players.find((player) => player.name === "阿禾");
    const third = started.players.find((player) => player.name === "小满");

    const presence = await rpc("set_secret_presence", {
      p_room_code: code,
      p_device_token: thirdToken,
      p_present: false,
    });
    assert.equal(presence.players.find((player) => player.id === third.id).present, false);

    await rpc("claim_secret_score", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_task_uid: `smoke-${randomUUID()}`,
      p_task_code: "M01-TST",
      p_task_id: "M01",
      p_points: 2,
      p_target_name: "2号 · 阿禾",
      p_witness_id: witness.id,
      p_played_on: new Date().toISOString().slice(0, 10),
    });
    const witnessView = await rpc("get_secret_room", { p_room_code: code, p_device_token: witnessToken });
    assert.equal(witnessView.pendingApprovals.length, 1);
    await expectRpcError("set_secret_room_status", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_status: "ended",
      p_reviewed_on: null,
    }, "PENDING_CLAIMS");

    await rpc("resolve_secret_score", {
      p_room_code: code,
      p_device_token: witnessToken,
      p_claim_id: witnessView.pendingApprovals[0].id,
      p_approved: true,
    });
    const scored = await rpc("get_secret_room", { p_room_code: code, p_device_token: ownerToken });
    assert.equal(scored.players.find((player) => player.id === scored.self.id).totalScore, 2);

    await rpc("claim_secret_score", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_task_uid: `smoke-${randomUUID()}`,
      p_task_code: "L01-TST",
      p_task_id: "L01",
      p_points: 1,
      p_target_name: "2号 · 阿禾",
      p_witness_id: witness.id,
      p_played_on: new Date().toISOString().slice(0, 10),
    });
    const secondWitnessView = await rpc("get_secret_room", { p_room_code: code, p_device_token: witnessToken });
    await rpc("resolve_secret_score", {
      p_room_code: code,
      p_device_token: witnessToken,
      p_claim_id: secondWitnessView.pendingApprovals[0].id,
      p_approved: true,
    });
    await expectRpcError("claim_secret_score", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_task_uid: `smoke-${randomUUID()}`,
      p_task_code: "H03-TST",
      p_task_id: "H03",
      p_points: 3,
      p_target_name: "3号 · 小满",
      p_witness_id: witness.id,
      p_played_on: new Date().toISOString().slice(0, 10),
    }, "DAILY_LIMIT");

    const reviewDate = new Date().toISOString().slice(0, 10);
    await rpc("set_secret_room_status", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_status: "review",
      p_reviewed_on: reviewDate,
    });
    await rpc("save_secret_review", { p_room_code: code, p_device_token: ownerToken, p_note: "最巧妙的一次" });
    const reviewed = await rpc("save_secret_review", { p_room_code: code, p_device_token: witnessToken, p_note: "最默契的一次" });
    assert.equal(reviewed.reviews.length, 2);
    const awarded = await rpc("award_secret_review", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_player_id: witness.id,
    });
    assert.equal(awarded.players.find((player) => player.id === awarded.self.id).totalScore, 3);
    assert.equal(awarded.players.find((player) => player.id === witness.id).totalScore, 1);

    await rpc("set_secret_room_status", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_status: "playing",
      p_reviewed_on: null,
    });
    const ended = await rpc("set_secret_room_status", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_status: "ended",
      p_reviewed_on: null,
    });
    assert.equal(ended.status, "ended");
    deleted = await rpc("delete_secret_room", { p_room_code: code, p_device_token: ownerToken });
    assert.equal(deleted, true);
    console.log(JSON.stringify({ roomCode: code, players: 3, ownerScore: 3, witnessScore: 1, dailyLimitEnforced: true, deleted }));
  } finally {
    if (!deleted) console.error(`Smoke room ${code} requires manual cleanup.`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
