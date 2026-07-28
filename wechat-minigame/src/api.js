const config = require("./config");

const ERROR_MESSAGES = {
  ROOM_NOT_FOUND: "没有找到这个房间",
  ROOM_FULL: "房间已经满员",
  ROOM_STARTED: "房间已经开局，不能再加入",
  INVALID_MEMBER: "本机房间凭证已失效",
  INVALID_NAME: "请选择有效的旅行代号",
  INVALID_REVIEW: "请选择有效的复盘印象",
  INVALID_CAPACITY: "人数需设置为 3–12 人",
  NOT_ENOUGH_PLAYERS: "至少 3 人到齐才能开局",
  OWNER_ONLY: "只有房主可以操作",
  WITNESS_ONLY: "只有指定见证人可以确认",
  INVALID_ROOM_STATUS: "当前房间阶段不能执行此操作",
  INVALID_WITNESS: "请选择另一名在场玩家见证",
  INVALID_TASK: "密令编号与分值不一致",
  INVALID_PLAY_DATE: "任务日期无效",
  DAILY_LIMIT: "今天已经提交过 2 次计分",
  PENDING_CLAIMS: "还有待见证任务，确认后才能结束旅程",
};

function friendlyError(payload, fallback = "联机操作失败") {
  const source = typeof payload === "string" ? payload : payload?.message || payload?.error_description || "";
  const key = Object.keys(ERROR_MESSAGES).find((code) => source.includes(code));
  return new Error(key ? ERROR_MESSAGES[key] : source || fallback);
}

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else reject(friendlyError(response.data, `服务暂时不可用（${response.statusCode}）`));
      },
      fail(error) {
        reject(friendlyError(error, "网络连接失败，请稍后重试"));
      },
    });
  });
}

async function rpc(name, params) {
  return request({
    url: `${config.supabaseUrl}/rest/v1/rpc/${name}`,
    method: "POST",
    header: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    data: params,
  });
}

module.exports = {
  createRoom(name, token, capacity) {
    return rpc("create_secret_room", { p_name: name, p_device_token: token, p_max_players: capacity });
  },
  joinRoom(code, name, token) {
    return rpc("join_secret_room", { p_room_code: code, p_name: name, p_device_token: token });
  },
  getRoom(code, token) {
    return rpc("get_secret_room", { p_room_code: code, p_device_token: token });
  },
  startRoom(code, token) {
    return rpc("start_secret_room", { p_room_code: code, p_device_token: token });
  },
  setPresence(code, token, present) {
    return rpc("set_secret_presence", { p_room_code: code, p_device_token: token, p_present: present });
  },
  setRoomStatus(code, token, status, reviewedOn = null) {
    return rpc("set_secret_room_status", {
      p_room_code: code,
      p_device_token: token,
      p_status: status,
      p_reviewed_on: reviewedOn,
    });
  },
  claimScore(code, token, task, witnessId) {
    return rpc("claim_secret_score", {
      p_room_code: code,
      p_device_token: token,
      p_task_uid: task.uid,
      p_task_code: task.code,
      p_task_id: task.taskId,
      p_points: task.score,
      p_target_name: task.targetName,
      p_witness_id: witnessId,
      p_played_on: task.playedOn,
    });
  },
  resolveScore(code, token, claimId, approved) {
    return rpc("resolve_secret_score", {
      p_room_code: code,
      p_device_token: token,
      p_claim_id: claimId,
      p_approved: approved,
    });
  },
  saveReview(code, token, note) {
    return rpc("save_secret_review", { p_room_code: code, p_device_token: token, p_note: note });
  },
  awardReview(code, token, playerId) {
    return rpc("award_secret_review", { p_room_code: code, p_device_token: token, p_player_id: playerId });
  },
  deleteRoom(code, token) {
    return rpc("delete_secret_room", { p_room_code: code, p_device_token: token });
  },
};
