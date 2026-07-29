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
    p_name: "自定义队长",
    p_device_token: ownerToken,
    p_max_players: 3,
  });
  const code = created.roomCode;
  let deleted = false;

  try {
    await rpc("join_secret_room", { p_room_code: code, p_name: "Mars-7", p_device_token: witnessToken });
    const joined = await rpc("join_secret_room", { p_room_code: code, p_name: "小王同学", p_device_token: thirdToken });
    assert.equal(joined.players.length, 3);

    const renamed = await rpc("update_secret_name", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_name: "山山队长",
    });
    assert.equal(renamed.self.name, "山山队长");
    await expectRpcError("update_secret_name", {
      p_room_code: code,
      p_device_token: ownerToken,
      p_name: "1234567890123",
    }, "INVALID_NAME");

    const prepared = await rpc("start_secret_room", { p_room_code: code, p_device_token: ownerToken });
    assert.equal(prepared.status, "lobby");
    assert.equal(prepared.hiddenTask.status, "editing");

    const members = [
      { token: ownerToken, name: "山山队长" },
      { token: witnessToken, name: "Mars-7" },
      { token: thirdToken, name: "小王同学" },
    ];
    const setupViews = await Promise.all(members.map(async (member) => ({
      ...member,
      room: await rpc("get_secret_room", { p_room_code: code, p_device_token: member.token }),
    })));
    const editor = setupViews.find((member) => member.room.hiddenTask.isEditor);
    assert.ok(editor);

    const started = await rpc("submit_secret_hidden_task", {
      p_room_code: code,
      p_device_token: editor.token,
      p_description: "让任意一位同行主动提议拍一张安全的三人合照。",
    });
    assert.equal(started.status, "playing");
    assert.equal(started.hiddenTask.status, "ready");

    const playingViews = await Promise.all(members.map(async (member) => ({
      ...member,
      room: await rpc("get_secret_room", { p_room_code: code, p_device_token: member.token }),
    })));
    const assignee = playingViews.find((member) => member.room.hiddenTask.availableForSelf);
    assert.ok(assignee);
    assert.notEqual(assignee.token, editor.token);
    const nonAssignee = playingViews.find((member) => member.token !== assignee.token);
    await expectRpcError("take_secret_hidden_task", {
      p_room_code: code,
      p_device_token: nonAssignee.token,
    }, "HIDDEN_TASK_NOT_ASSIGNED");
    const hidden = await rpc("take_secret_hidden_task", { p_room_code: code, p_device_token: assignee.token });
    assert.equal(hidden.task.taskId, "X01");
    assert.equal(hidden.task.isHidden, true);
    assert.equal(hidden.room.hiddenTask.status, "claimed");

    const witness = started.players.find((player) => player.name === "Mars-7");
    const third = started.players.find((player) => player.name === "小王同学");

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
      p_target_name: "2号 · Mars-7",
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
      p_target_name: "2号 · Mars-7",
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
      p_target_name: "3号 · 小王同学",
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
    console.log(JSON.stringify({ roomCode: code, players: 3, customNames: true, hiddenTaskAssigned: true, ownerScore: 3, witnessScore: 1, dailyLimitEnforced: true, deleted }));
  } finally {
    if (!deleted) console.error(`Smoke room ${code} requires manual cleanup.`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
