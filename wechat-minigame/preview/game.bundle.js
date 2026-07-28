(function(){
const modules={0: function(module, exports, __require) {
const { TravelSecretGame } = __require(1);

const game = new TravelSecretGame();
game.start();


},
1: function(module, exports, __require) {
const api = __require(2);
const config = __require(3);
const { dateKey, drawMission } = __require(4);
const { deviceToken, loadState, saveState } = __require(5);
const { GameRenderer } = __require(6);

const RECORD_STATUS = {
  submit_pending: "待上传",
  sync_error: "待联网",
  pending: "待见证",
  approved: "已计分",
  rejected: "未通过",
  abandoned: "已放弃",
  expired: "已超时",
};

const TRAVEL_NAMES = ["一山", "阿禾", "小满", "青川", "南星", "木木", "可乐", "石榴", "松风", "朝露", "云舟", "听雨"];
const REVIEW_PRESETS = ["最好笑的一次", "最巧妙的一次", "最默契的一次", "最意外的一次", "今天很顺利", "期待明天继续"];

function formatReviewDate(key) {
  if (!key) return "今日复盘";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return `${month}月${day}日 · ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}`;
}

function timeLeft(timestamp) {
  const remaining = Math.max(0, timestamp - Date.now());
  const totalMinutes = Math.ceil(remaining / 60000);
  if (totalMinutes >= 60) return `${Math.floor(totalMinutes / 60)}小时${totalMinutes % 60}分`;
  return `${totalMinutes}分钟`;
}

function promptText(title, placeholder, initial = "") {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content: initial,
      editable: true,
      placeholderText: placeholder,
      confirmText: "确定",
      success(result) {
        resolve(result.confirm ? String(result.content || "").trim() : null);
      },
      fail() { resolve(null); },
    });
  });
}

function confirm(title, content, confirmText = "确定") {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      confirmColor: "#b64b43",
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    });
  });
}

class TravelSecretGame {
  constructor() {
    this.local = loadState();
    this.token = deviceToken();
    this.room = null;
    this.screen = "home";
    this.inviteCode = "";
    this.busy = false;
    this.toast = "";
    this.toastTimer = null;
    this.pollTimer = null;
    this.clockTimer = null;
    this.overlayPicker = null;
    this.lastRoomStatus = null;
    this.renderer = new GameRenderer(this);
  }

  start() {
    const launch = wx.getLaunchOptionsSync?.() || {};
    this.inviteCode = String(launch.query?.room || "").replace(/\D/g, "").slice(0, 6);
    wx.showShareMenu?.({ withShareTicket: true, menus: ["shareAppMessage"] });
    wx.onShareAppMessage?.(() => this.sharePayload());
    wx.onShow?.(() => {
      if (this.local.session) this.refreshRoom({ quiet: true });
    });
    this.render();
    if (this.local.session) this.refreshRoom();
    this.clockTimer = setInterval(() => {
      this.expireTaskIfNeeded();
      this.render();
    }, 30000);
  }

  model() {
    const today = dateKey();
    const drawnToday = this.local.history.filter((record) => record.playedOn === today).length
      + (this.local.activeTask?.playedOn === today ? 1 : 0);
    const todayApprovedScore = this.local.history
      .filter((record) => record.playedOn === today && record.status === "approved")
      .reduce((sum, record) => sum + record.score, 0);
    const room = this.room || {
      players: [],
      pendingApprovals: [],
      myClaims: [],
      reviews: [],
      status: "lobby",
      self: {},
    };
    const ranking = [...room.players].sort((a, b) => b.totalScore - a.totalScore || a.seat - b.seat);
    const myReview = room.reviews.find((review) => review.playerId === room.self.id);
    return {
      screen: this.screen,
      desiredCapacity: this.local.desiredCapacity,
      inviteCode: this.inviteCode,
      room: this.room,
      activeTask: this.local.activeTask,
      history: [...this.local.history].reverse(),
      ranking,
      remainingDraws: Math.max(0, config.dailyDrawLimit - drawnToday),
      todayApprovedScore,
      taskTimeLeft: this.local.activeTask ? timeLeft(this.local.activeTask.expiresAt) : "",
      reviewDateLabel: formatReviewDate(room.currentReviewOn),
      myReview,
      busy: this.busy,
      toast: this.toast,
      overlayPicker: this.overlayPicker,
      statusLabel: (status) => RECORD_STATUS[status] || status,
    };
  }

  render() {
    this.renderer.render(this.model());
  }

  persist() {
    saveState(this.local);
    this.render();
  }

  showToast(message) {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = "";
      this.render();
    }, 2400);
    this.render();
  }

  async runBusy(operation) {
    if (this.busy) return null;
    this.busy = true;
    this.render();
    try {
      return await operation();
    } catch (error) {
      this.showToast(error?.message || "操作失败，请稍后再试");
      return null;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  setRoom(room, preferredScreen = null) {
    if (!room?.roomCode || !room?.self) throw new Error("房间数据无效");
    const oldStatus = this.lastRoomStatus;
    this.room = room;
    this.lastRoomStatus = room.status;
    this.local.session = {
      roomCode: room.roomCode,
      playerId: room.self.id,
      seat: room.self.seat,
      name: room.self.name,
    };
    this.local.profileName = room.self.name;
    this.syncClaimStatuses();
    saveState(this.local);

    if (preferredScreen) this.screen = preferredScreen;
    else if (room.status === "lobby") this.screen = "lobby";
    else if (room.status === "review" && oldStatus !== "review") this.screen = "review";
    else if (room.status === "ended") this.screen = "ranking";
    else if (room.status === "playing" && ["home", "lobby"].includes(this.screen)) this.screen = "missions";
    this.startPolling();
    this.render();
  }

  syncClaimStatuses() {
    if (!this.room) return;
    const byTask = new Map((this.room.myClaims || []).map((claim) => [claim.taskUid, claim.status]));
    let changed = false;
    for (const record of this.local.history) {
      const next = byTask.get(record.uid);
      if (next && record.status !== next) {
        record.status = next;
        changed = true;
      }
    }
    if (changed) saveState(this.local);
  }

  startPolling() {
    clearInterval(this.pollTimer);
    if (!this.local.session || this.room?.status === "ended") return;
    this.pollTimer = setInterval(() => this.refreshRoom({ quiet: true }), config.pollIntervalMs);
  }

  async refreshRoom({ quiet = false } = {}) {
    if (!this.local.session || this.busy) return;
    const refresh = async () => {
      const room = await api.getRoom(this.local.session.roomCode, this.token);
      this.setRoom(room);
      await this.syncPendingClaims();
      return room;
    };
    if (quiet) {
      try { await refresh(); } catch (_) { /* The next poll retries. */ }
    } else {
      await this.runBusy(refresh);
    }
  }

  async syncPendingClaims() {
    if (!this.room || this.room.status !== "playing") return;
    const pending = this.local.history.filter((record) => ["submit_pending", "sync_error"].includes(record.status));
    for (const record of pending) {
      try {
        const room = await api.claimScore(this.room.roomCode, this.token, record, record.witnessId);
        record.status = "pending";
        this.setRoom(room);
      } catch (_) {
        record.status = "sync_error";
      }
    }
    if (pending.length) saveState(this.local);
  }

  expireTaskIfNeeded() {
    const task = this.local.activeTask;
    if (!task || task.expiresAt > Date.now()) return;
    this.local.history.push({ ...task, status: "expired", resolvedAt: Date.now() });
    this.local.activeTask = null;
    saveState(this.local);
    this.showToast("密令已超时，计为 0 分");
  }

  sharePayload() {
    const code = this.room?.roomCode || this.inviteCode;
    return {
      title: code ? `加入我的游侠密令房：${code}` : "游侠密令 · 旅行中的隐秘任务",
      query: code ? `room=${code}` : "",
      imageUrl: "assets/share-cover.png",
    };
  }

  shareRoom() {
    if (!this.room) return;
    wx.shareAppMessage?.(this.sharePayload());
  }

  async createRoom() {
    this.overlayPicker = {
      type: "profile",
      title: "选择旅行代号",
      options: TRAVEL_NAMES.map((name) => ({ label: name, value: name })),
      help: "座位号会自动分配，代号可以重复",
      nextAction: "create",
    };
    this.render();
  }

  async finishCreateRoom(name) {
    this.overlayPicker = null;
    await this.runBusy(async () => {
      const room = await api.createRoom(name, this.token, this.local.desiredCapacity);
      this.setRoom(room, "lobby");
      this.showToast("密令房已创建");
    });
  }

  async joinRoom() {
    const entered = await promptText("加入密令房", "输入 6 位房间号", this.inviteCode);
    if (entered === null) return;
    const code = entered.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) return this.showToast("请输入 6 位房间号");
    this.pendingJoinCode = code;
    this.overlayPicker = {
      type: "profile",
      title: "选择旅行代号",
      options: TRAVEL_NAMES.map((name) => ({ label: name, value: name })),
      help: "座位号会自动分配，代号可以重复",
      nextAction: "join",
    };
    this.render();
  }

  async finishJoinRoom(name) {
    const code = this.pendingJoinCode;
    this.overlayPicker = null;
    await this.runBusy(async () => {
      const room = await api.joinRoom(code, name, this.token);
      this.setRoom(room);
      this.inviteCode = code;
      this.showToast("已加入同行房间");
    });
  }

  async startRoom() {
    await this.runBusy(async () => {
      const room = await api.startRoom(this.room.roomCode, this.token);
      this.setRoom(room, "missions");
      this.showToast("旅程开始，密令已启封");
    });
  }

  drawTask() {
    if (!this.room || this.room.status !== "playing" || this.local.activeTask) return;
    const model = this.model();
    if (model.remainingDraws <= 0) return this.showToast("今日抽取次数已用完");
    try {
      const presentPlayers = this.room.players.filter((player) => player.present !== false);
      if (!presentPlayers.some((player) => player.id === this.room.self.id)) {
        return this.showToast("请先在房间菜单中重新归队");
      }
      this.local.activeTask = drawMission({
        players: presentPlayers,
        selfId: this.room.self.id,
        history: this.local.history,
      });
      this.persist();
    } catch (error) {
      this.showToast(error.message);
    }
  }

  toggleTask() {
    if (!this.local.activeTask) return;
    this.local.activeTask.revealed = !this.local.activeTask.revealed;
    this.persist();
  }

  openWitnessPicker() {
    if (!this.local.activeTask || !this.room) return;
    const options = this.room.players
      .filter((player) => player.id !== this.room.self.id)
      .map((player) => ({
        label: `${player.seat}号 · ${player.name}${player.online ? "" : "（暂离）"}`,
        value: player.id,
      }));
    this.overlayPicker = { type: "witness", title: "谁来见证这次密令？", options, help: "对方将在自己的手机上确认" };
    this.render();
  }

  async completeTask(witnessId) {
    const task = this.local.activeTask;
    if (!task) return;
    const record = { ...task, revealed: true, status: "submit_pending", witnessId, resolvedAt: Date.now() };
    this.local.history.push(record);
    this.local.activeTask = null;
    this.overlayPicker = null;
    saveState(this.local);
    this.render();
    await this.runBusy(async () => {
      try {
        const room = await api.claimScore(this.room.roomCode, this.token, record, witnessId);
        record.status = "pending";
        this.setRoom(room);
        this.showToast("已送达见证人，确认后计分");
      } catch (error) {
        record.status = "sync_error";
        saveState(this.local);
        throw error;
      }
    });
  }

  async abandonTask() {
    if (!this.local.activeTask) return;
    const accepted = await confirm("放弃当前密令？", "这次抽取仍会计入今日次数，并记为 0 分。", "放弃");
    if (!accepted) return;
    this.local.history.push({ ...this.local.activeTask, status: "abandoned", resolvedAt: Date.now() });
    this.local.activeTask = null;
    this.persist();
  }

  async resolveClaim(claimId, approved) {
    const claim = this.room.pendingApprovals.find((item) => item.id === claimId);
    if (!claim) return;
    if (!approved) {
      const accepted = await confirm("驳回这次计分？", "对方会看到“未通过”，本次不会加分。", "驳回");
      if (!accepted) return;
    }
    await this.runBusy(async () => {
      const room = await api.resolveScore(this.room.roomCode, this.token, claimId, approved);
      this.setRoom(room);
      this.showToast(approved ? "见证完成，分数已计入" : "已驳回这次计分");
    });
  }

  async enterReview() {
    await this.runBusy(async () => {
      const room = await api.setRoomStatus(this.room.roomCode, this.token, "review", dateKey());
      this.setRoom(room, "review");
      this.showToast("今日复盘已开始");
    });
  }

  async writeReview() {
    this.overlayPicker = {
      type: "review",
      title: "今天给你的印象",
      options: REVIEW_PRESETS.map((note) => ({ label: note, value: note })),
      help: "复盘时可以当面分享具体故事",
    };
    this.render();
  }

  async saveReviewPreset(note) {
    this.overlayPicker = null;
    this.local.reviewDrafts[this.room.currentReviewOn] = note;
    saveState(this.local);
    await this.runBusy(async () => {
      const room = await api.saveReview(this.room.roomCode, this.token, note);
      this.setRoom(room, "review");
      this.showToast("复盘留言已保存");
    });
  }

  openAwardPicker() {
    const reviewedIds = new Set(this.room.reviews.map((review) => review.playerId));
    const options = this.room.players
      .filter((player) => reviewedIds.has(player.id))
      .map((player) => ({ label: `${player.seat}号 · ${player.name}`, value: player.id }));
    this.overlayPicker = { type: "award", title: "今日最佳妙计", options, help: "每次复盘只能奖励 1 人 +1 分" };
    this.render();
  }

  async awardReview(playerId) {
    this.overlayPicker = null;
    await this.runBusy(async () => {
      const room = await api.awardReview(this.room.roomCode, this.token, playerId);
      this.setRoom(room, "review");
      this.showToast("最佳妙计已加 1 分");
    });
  }

  async resumeRoom() {
    await this.runBusy(async () => {
      const room = await api.setRoomStatus(this.room.roomCode, this.token, "playing");
      this.setRoom(room, "missions");
      this.showToast("复盘完成，旅程继续");
    });
  }

  async endRoom() {
    const accepted = await confirm("结束整段旅程？", "结束后房间只保留最终排行榜，不能继续抽取密令。", "结束旅程");
    if (!accepted) return;
    await this.runBusy(async () => {
      const room = await api.setRoomStatus(this.room.roomCode, this.token, "ended");
      this.setRoom(room, "ranking");
      this.showToast("旅程已结算");
    });
  }

  async roomMenu() {
    const self = this.room.players.find((player) => player.id === this.room.self.id);
    const presenceLabel = self?.present === false ? "重新归队" : "暂离本轮";
    const items = ["复制房间号", "分享给同行", presenceLabel, "规则与安全边界", "退出本机"];
    wx.showActionSheet({
      itemList: items,
      success: ({ tapIndex }) => {
        if (tapIndex === 0) wx.setClipboardData?.({ data: this.room.roomCode });
        else if (tapIndex === 1) this.shareRoom();
        else if (tapIndex === 2) this.togglePresence(self?.present === false);
        else if (tapIndex === 3) this.showRules();
        else if (tapIndex === 4) this.leaveLocal();
      },
    });
  }

  async togglePresence(present) {
    await this.runBusy(async () => {
      const room = await api.setPresence(this.room.roomCode, this.token, present);
      this.setRoom(room);
      this.showToast(present ? "已重新归队" : "已暂离，本轮不会成为任务目标");
    });
  }

  async deleteRoom() {
    const accepted = await confirm("永久删除房间数据？", "排行榜、计分和复盘将无法恢复。", "永久删除");
    if (!accepted) return;
    await this.runBusy(async () => {
      await api.deleteRoom(this.room.roomCode, this.token);
      clearInterval(this.pollTimer);
      this.local.session = null;
      this.local.activeTask = null;
      this.room = null;
      this.screen = "home";
      saveState(this.local);
      this.showToast("房间数据已永久删除");
    });
  }

  showRules() {
    wx.showModal({
      title: "游侠密令规则",
      content: "每天可抽 2 次密令，每次限时 2 小时。完成后指定一名同行见证，确认后按难度获得 1–3 分。不要执行危险、冒犯、违法或影响陌生人的任务；任何人不舒服都应立即停止。每日可复盘一次，房主评选最佳妙计 +1 分。",
      showCancel: false,
      confirmText: "明白",
    });
  }

  async leaveLocal() {
    const accepted = await confirm("退出当前房间？", "只清除本机入口，不会删除房间和排行榜。使用同一台手机重新输入房间号即可回来。", "退出");
    if (!accepted) return;
    clearInterval(this.pollTimer);
    this.local.session = null;
    this.local.activeTask = null;
    this.room = null;
    this.screen = "home";
    this.lastRoomStatus = null;
    saveState(this.local);
    this.renderer.resetScroll("home");
    this.render();
  }

  navigate(screen) {
    if (!this.room || this.room.status === "lobby") return;
    this.screen = screen;
    this.renderer.resetScroll(screen);
    this.render();
  }

  handleAction(action, payload) {
    const actions = {
      capacity_down: () => { this.local.desiredCapacity = Math.max(3, this.local.desiredCapacity - 1); this.persist(); },
      capacity_up: () => { this.local.desiredCapacity = Math.min(12, this.local.desiredCapacity + 1); this.persist(); },
      create_room: () => this.createRoom(),
      join_room: () => this.joinRoom(),
      show_rules: () => this.showRules(),
      share_room: () => this.shareRoom(),
      start_room: () => this.startRoom(),
      room_menu: () => this.roomMenu(),
      draw_task: () => this.drawTask(),
      toggle_task: () => this.toggleTask(),
      complete_task: () => this.openWitnessPicker(),
      abandon_task: () => this.abandonTask(),
      approve_claim: () => this.resolveClaim(payload, true),
      reject_claim: () => this.resolveClaim(payload, false),
      navigate: () => this.navigate(payload),
      enter_review: () => this.enterReview(),
      write_review: () => this.writeReview(),
      award_review: () => this.openAwardPicker(),
      resume_room: () => this.resumeRoom(),
      end_room: () => this.endRoom(),
      delete_room: () => this.deleteRoom(),
      leave_local: () => this.leaveLocal(),
      close_picker: () => { this.overlayPicker = null; this.render(); },
      picker_select: () => {
        if (this.overlayPicker?.type === "witness") this.completeTask(payload);
        else if (this.overlayPicker?.type === "award") this.awardReview(payload);
        else if (this.overlayPicker?.type === "review") this.saveReviewPreset(payload);
        else if (this.overlayPicker?.type === "profile" && this.overlayPicker.nextAction === "create") this.finishCreateRoom(payload);
        else if (this.overlayPicker?.type === "profile" && this.overlayPicker.nextAction === "join") this.finishJoinRoom(payload);
      },
    };
    return actions[action]?.();
  }
}

module.exports = { TravelSecretGame, RECORD_STATUS, REVIEW_PRESETS, TRAVEL_NAMES, formatReviewDate, timeLeft };

},
2: function(module, exports, __require) {
const config = __require(3);

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

},
3: function(module, exports, __require) {
module.exports = {
  appName: "游侠密令",
  supabaseUrl: "https://pdahxhpgxmsqntoozsgo.supabase.co",
  supabaseAnonKey: "sb_publishable_ApR8zOwmhO1329Zk4lUBSw_g-DnN-Fy",
  pollIntervalMs: 5000,
  dailyDrawLimit: 2,
  taskExpiryMs: 2 * 60 * 60 * 1000,
};

},
4: function(module, exports, __require) {
const WORDS = ["随便", "等一下", "我看看", "真的", "可以", "确定", "不知道", "没问题"];

const TASKS = [
  { id: "L01", score: 1, minPlayers: 2, build: ({ target, word }) => `让${target}在自然对话中说出“${word}”。` },
  { id: "L02", score: 1, minPlayers: 2, build: ({ target }) => `让${target}问你一个包含“为什么”的问题。` },
  { id: "L03", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动问现在几点。` },
  { id: "L04", score: 1, minPlayers: 2, build: ({ target }) => `让${target}向你推荐一道菜或一家店。` },
  { id: "L05", score: 1, minPlayers: 2, build: ({ target }) => `让${target}向你推荐一首歌。` },
  { id: "L06", score: 1, minPlayers: 2, build: ({ target }) => `让${target}自然说出一个今天行程相关的地名。` },
  { id: "L07", score: 1, minPlayers: 2, build: ({ target }) => `让${target}把纸巾、笔或普通充电线递给你，随后立即归还。` },
  { id: "L08", score: 1, minPlayers: 2, build: ({ target }) => `让${target}在 5 分钟内说出你的名字两次。` },
  { id: "L09", score: 1, minPlayers: 3, build: ({ target, other }) => `让${target}向${other}问一个包含“哪里”的问题。` },
  { id: "L10", score: 1, minPlayers: 2, build: ({ target }) => `让${target}在中文对话中自然说出一个非中文单词。` },
  { id: "L11", score: 1, minPlayers: 2, build: ({ target }) => `让${target}纠正你说错的一个无关紧要的常识。` },
  { id: "L12", score: 1, minPlayers: 3, build: ({ target, other }) => `让${target}把${other}叫到你们当前所在的安全位置。` },
  { id: "M01", score: 2, minPlayers: 2, build: ({ target, word }) => `10 分钟内，让${target}先说“${word}”，再递给你一件允许的小物品。` },
  { id: "M02", score: 2, minPlayers: 2, build: ({ target }) => `让${target}先纠正一个无关紧要的错误，再继续追问一个相关问题。` },
  { id: "M03", score: 2, minPlayers: 2, build: ({ target, word }) => `让${target}先向你推荐一道菜、歌或景点，随后自然说出“${word}”。` },
  { id: "M04", score: 2, minPlayers: 2, build: ({ target }) => `让${target}先说出你的名字，再问你一个包含“为什么”的问题。` },
  { id: "M05", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}在 10 分钟内向你和${other}询问同一件无害的小事。` },
  { id: "M06", score: 2, minPlayers: 2, build: ({ target }) => `让${target}自然模仿一个安全小动作，随后问你一个问题。` },
  { id: "M07", score: 2, minPlayers: 3, build: ({ target }) => `让${target}提出一项小型集体活动，并让至少另一人同意参加。` },
  { id: "M08", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}主动询问${other}的菜品、歌曲或景点推荐。` },
  { id: "M09", score: 2, minPlayers: 2, build: ({ target, word, secondWord }) => `10 分钟内，让${target}自然说出“${word}”和“${secondWord}”。` },
  { id: "M10", score: 2, minPlayers: 2, build: ({ target }) => `让${target}主动决定一次合照的站位或拍摄角度，并完成拍摄。` },
  { id: "H01", score: 3, minPlayers: 3, build: ({ target, other, word }) => `让${target}在不知情的情况下，引导${other}说出“${word}”。` },
  { id: "H02", score: 3, minPlayers: 3, build: ({ target, other, word }) => `30 分钟内，让${target}和${other}在互不商量时分别说出“${word}”。` },
  { id: "H03", score: 3, minPlayers: 4, build: ({ target }) => `让${target}主动发起并完成一项至少 3 人参与、5 分钟以内的小活动。` },
  { id: "H04", score: 3, minPlayers: 4, build: ({ target, other }) => `让${target}主动邀请${other}参加一次至少 4 人的合照，并完成拍摄。` },
  { id: "H05", score: 3, minPlayers: 3, build: ({ target, other }) => `让${target}给出一项推荐，并自然说服${other}明确表示赞同。` },
  { id: "H06", score: 3, minPlayers: 2, build: ({ target, word }) => `15 分钟内，让${target}依次说出你的名字、递给你一件允许物品、再说出“${word}”。` },
  { id: "H07", score: 3, minPlayers: 3, build: ({ target, other }) => `让${target}纠正你一个无关紧要的错误，再主动请${other}确认。` },
  { id: "H08", score: 3, minPlayers: 3, build: ({ target, other }) => `15 分钟内，让${target}分别向你和${other}提出两个不同问题，其中一个包含“为什么”，另一个包含“哪里”。` },
];

function randomItem(items, random = Math.random) {
  return items[Math.floor(random() * items.length)];
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeId(prefix = "mission", random = Math.random, now = Date.now()) {
  return `${prefix}-${now.toString(36)}-${Math.floor(random() * 1679616).toString(36).padStart(4, "0")}`;
}

function chooseScore(random = Math.random) {
  const value = random();
  if (value < 0.45) return 1;
  if (value < 0.8) return 2;
  return 3;
}

function playerLabel(player) {
  return `${player.seat}号 · ${player.name}`;
}

function drawMission({ players, selfId, history = [], random = Math.random, now = Date.now() }) {
  const others = players.filter((player) => player.id !== selfId);
  if (!others.length) throw new Error("至少需要两名玩家才能抽取密令");

  let score = chooseScore(random);
  while (!TASKS.some((task) => task.score === score && task.minPlayers <= players.length)) score -= 1;

  const recentIds = new Set(history.slice(-8).map((record) => record.taskId));
  let pool = TASKS.filter((task) => task.score === score && task.minPlayers <= players.length && !recentIds.has(task.id));
  if (!pool.length) pool = TASKS.filter((task) => task.score === score && task.minPlayers <= players.length);

  const task = randomItem(pool, random);
  const target = randomItem(others, random);
  const secondPool = others.filter((player) => player.id !== target.id);
  const other = secondPool.length ? randomItem(secondPool, random) : target;
  const word = randomItem(WORDS, random);
  let secondWord = randomItem(WORDS.filter((item) => item !== word), random);
  if (!secondWord) secondWord = "没问题";
  const code = `${task.id}-${Math.floor(random() * 46656).toString(36).padStart(3, "0").toUpperCase()}`;

  return {
    uid: makeId("mission", random, now),
    taskId: task.id,
    code,
    score: task.score,
    targetId: target.id,
    targetName: playerLabel(target),
    description: task.build({
      target: playerLabel(target),
      other: playerLabel(other),
      word,
      secondWord,
    }),
    drawnAt: now,
    expiresAt: now + 2 * 60 * 60 * 1000,
    playedOn: dateKey(new Date(now)),
    revealed: false,
  };
}

module.exports = { TASKS, WORDS, dateKey, drawMission, playerLabel };


},
5: function(module, exports, __require) {
const STORAGE_KEY = "travel-secret-minigame-v1";
const DEVICE_KEY = "travel-secret-minigame-device-v1";

function uuid() {
  const bytes = new Uint8Array(16);
  const cryptoApi = typeof crypto !== "undefined" ? crypto : null;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function loadJson(key, fallback = null) {
  try {
    const value = wx.getStorageSync(key);
    if (!value) return fallback;
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (_) {
    return fallback;
  }
}

function saveJson(key, value) {
  wx.setStorageSync(key, JSON.stringify(value));
}

function deviceToken() {
  let token = wx.getStorageSync(DEVICE_KEY);
  if (!token) {
    token = uuid();
    wx.setStorageSync(DEVICE_KEY, token);
  }
  return token;
}

function defaultState() {
  return {
    version: 1,
    profileName: "",
    session: null,
    desiredCapacity: 8,
    activeTask: null,
    history: [],
    reviewDrafts: {},
  };
}

function loadState() {
  const defaults = defaultState();
  const saved = loadJson(STORAGE_KEY, null);
  if (!saved || saved.version !== 1) return defaults;
  return {
    ...defaults,
    ...saved,
    history: Array.isArray(saved.history) ? saved.history : [],
    reviewDrafts: saved.reviewDrafts || {},
  };
}

function saveState(state) {
  saveJson(STORAGE_KEY, state);
}

module.exports = { STORAGE_KEY, defaultState, deviceToken, loadState, saveState };

},
6: function(module, exports, __require) {
const COLORS = {
  ink: "#243238",
  muted: "#6c7776",
  canvas: "#edf1ed",
  paper: "#fffdf7",
  paperWarm: "#f7f0df",
  line: "#d7ded9",
  jade: "#39735b",
  jadeDark: "#285343",
  jadeSoft: "#dfece4",
  red: "#b64b43",
  redDark: "#853630",
  redSoft: "#f3dfdc",
  gold: "#bd8a32",
  goldSoft: "#f3e7cb",
  blue: "#426d85",
  blueSoft: "#dfeaf0",
  wood: "#8b6240",
  woodDark: "#62452f",
  woodLight: "#b4885e",
  white: "#ffffff",
};

const STATUS_LABELS = {
  lobby: "等待同行",
  playing: "旅程进行中",
  review: "每日复盘",
  ended: "旅程结束",
};

function getWindowInfo() {
  if (wx.getWindowInfo) return wx.getWindowInfo();
  return wx.getSystemInfoSync();
}

class GameRenderer {
  constructor(app) {
    this.app = app;
    this.info = getWindowInfo();
    this.width = this.info.windowWidth;
    this.height = this.info.windowHeight;
    this.dpr = Math.min(this.info.pixelRatio || 1, 3);
    this.safeTop = Math.max(8, this.info.safeArea?.top || 8);
    this.safeBottom = Math.max(8, this.height - (this.info.safeArea?.bottom || this.height));
    this.headerHeight = this.safeTop + 64;
    this.navHeight = 72 + this.safeBottom;
    this.canvas = wx.createCanvas();
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx = this.canvas.getContext("2d");
    this.hits = [];
    this.scrollByScreen = {};
    this.maxScroll = 0;
    this.touch = null;
    this.model = null;
    this.logo = wx.createImage();
    this.logo.onload = () => this.render(this.model);
    this.logo.src = "assets/app-icon-192.png";
    this.bindTouches();
  }

  bindTouches() {
    wx.onTouchStart((event) => {
      const point = event.touches?.[0];
      if (!point) return;
      this.touch = {
        x: point.clientX,
        y: point.clientY,
        startY: point.clientY,
        startScroll: this.currentScroll(),
        moved: false,
      };
    });
    wx.onTouchMove((event) => {
      if (!this.touch || this.model?.overlayPicker) return;
      const point = event.touches?.[0];
      if (!point) return;
      const delta = point.clientY - this.touch.startY;
      if (Math.abs(delta) > 5) this.touch.moved = true;
      if (this.maxScroll > 0 && this.touch.startY > this.headerHeight && this.touch.startY < this.height - this.navHeight) {
        const next = Math.max(0, Math.min(this.maxScroll, this.touch.startScroll - delta));
        this.scrollByScreen[this.model.screen] = next;
        this.render(this.model);
      }
    });
    wx.onTouchEnd((event) => {
      if (!this.touch) return;
      const point = event.changedTouches?.[0] || this.touch;
      const moved = this.touch.moved || Math.hypot(point.clientX - this.touch.x, point.clientY - this.touch.y) > 8;
      if (!moved) {
        const hit = [...this.hits].reverse().find((item) => (
          point.clientX >= item.x && point.clientX <= item.x + item.width
          && point.clientY >= item.y && point.clientY <= item.y + item.height
        ));
        if (hit && !this.model?.busy) {
          wx.vibrateShort?.({ type: "light" });
          this.app.handleAction(hit.action, hit.payload);
        }
      }
      this.touch = null;
    });
  }

  currentScroll() {
    return this.scrollByScreen[this.model?.screen] || 0;
  }

  resetScroll(screen) {
    this.scrollByScreen[screen] = 0;
  }

  render(model) {
    if (!model) return;
    this.model = model;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.hits = [];
    this.maxScroll = 0;
    this.drawBackground();

    if (model.screen === "home") this.drawHome(model);
    else if (model.screen === "lobby") this.drawLobby(model);
    else if (model.screen === "missions") this.drawMissions(model);
    else if (model.screen === "ranking") this.drawRanking(model);
    else if (model.screen === "review") this.drawReview(model);
    else this.drawHome(model);

    if (model.overlayPicker) this.drawPicker(model.overlayPicker);
    if (model.toast) this.drawToast(model.toast);
    if (model.busy) this.drawBusy();
  }

  drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.canvas;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = "rgba(57,115,91,0.055)";
    ctx.lineWidth = 1;
    for (let x = 14; x < this.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 70, this.height);
      ctx.stroke();
    }
  }

  roundRect(x, y, width, height, radius = 8) {
    const ctx = this.ctx;
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  panel(x, y, width, height, fill = COLORS.paper, stroke = COLORS.line, radius = 8) {
    const ctx = this.ctx;
    this.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  text(value, x, y, size = 14, color = COLORS.ink, align = "left", weight = "400") {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), x, y);
    ctx.restore();
  }

  wrapText(value, x, y, maxWidth, lineHeight = 24, maxLines = 4, options = {}) {
    const ctx = this.ctx;
    const characters = Array.from(String(value));
    const lines = [];
    let line = "";
    ctx.save();
    ctx.font = `${options.weight || "400"} ${options.size || 16}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    for (const character of characters) {
      const next = line + character;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = next;
      }
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.join("").length < characters.length && lines.length) {
      let finalLine = lines[lines.length - 1];
      while (finalLine && ctx.measureText(`${finalLine}…`).width > maxWidth) finalLine = finalLine.slice(0, -1);
      lines[lines.length - 1] = `${finalLine}…`;
    }
    ctx.restore();
    lines.forEach((item, index) => this.text(
      item,
      x,
      y + index * lineHeight,
      options.size || 16,
      options.color || COLORS.ink,
      options.align || "left",
      options.weight || "400",
    ));
    return lines.length * lineHeight;
  }

  hit(action, x, y, width, height, payload = null) {
    if (x + width < 0 || x > this.width || y + height < 0 || y > this.height) return;
    this.hits.push({ action, x, y, width, height, payload });
  }

  button({ x, y, width, height = 48, label, action, payload, kind = "primary", icon = null, disabled = false }) {
    const palette = {
      primary: [COLORS.jade, COLORS.white, COLORS.jadeDark],
      secondary: [COLORS.paper, COLORS.ink, COLORS.line],
      danger: [COLORS.redSoft, COLORS.redDark, "#d7aaa5"],
      gold: [COLORS.goldSoft, "#71521c", "#ddc38c"],
      dark: [COLORS.ink, COLORS.white, COLORS.ink],
    }[kind];
    this.panel(x, y, width, height, disabled ? "#e6e9e7" : palette[0], disabled ? "#d5dad7" : palette[2], 8);
    const labelX = icon && label ? x + width / 2 + 10 : x + width / 2;
    if (icon) {
      this.ctx.save();
      this.ctx.font = "600 15px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
      const textWidth = this.ctx.measureText(label).width;
      this.ctx.restore();
      const iconX = label ? labelX - textWidth / 2 - 15 : x + width / 2;
      this.icon(icon, iconX, y + height / 2, disabled ? "#9aa29f" : palette[1], 19);
    }
    this.text(label, labelX, y + height / 2 + 0.5, 15, disabled ? "#9aa29f" : palette[1], "center", "600");
    if (!disabled) this.hit(action, x, y, width, height, payload);
  }

  icon(name, x, y, color = COLORS.ink, size = 20) {
    const ctx = this.ctx;
    const s = size / 20;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (name === "dice") {
      ctx.rect(-8, -8, 16, 16);
      ctx.stroke();
      for (const [dx, dy] of [[-4, -4], [4, 4], [0, 0]]) {
        ctx.beginPath(); ctx.arc(dx, dy, 1.25, 0, Math.PI * 2); ctx.fill();
      }
    } else if (name === "rank") {
      ctx.moveTo(-8, 8); ctx.lineTo(-8, 1); ctx.lineTo(-3, 1); ctx.lineTo(-3, 8);
      ctx.moveTo(-2, 8); ctx.lineTo(-2, -7); ctx.lineTo(3, -7); ctx.lineTo(3, 8);
      ctx.moveTo(4, 8); ctx.lineTo(4, -2); ctx.lineTo(9, -2); ctx.lineTo(9, 8); ctx.stroke();
    } else if (name === "review") {
      ctx.rect(-7, -8, 14, 16); ctx.moveTo(-3, -8); ctx.lineTo(-3, -10); ctx.lineTo(3, -10); ctx.lineTo(3, -8);
      ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.moveTo(-4, 3); ctx.lineTo(2, 3); ctx.stroke();
    } else if (name === "users") {
      ctx.arc(-3, -4, 3.5, 0, Math.PI * 2); ctx.moveTo(-9, 8); ctx.quadraticCurveTo(-3, 1, 3, 8);
      ctx.moveTo(5, -6); ctx.arc(5, -3, 2.6, -Math.PI / 2, Math.PI * 1.5); ctx.moveTo(4, 2); ctx.quadraticCurveTo(9, 3, 10, 7); ctx.stroke();
    } else if (name === "share") {
      for (const [dx, dy] of [[-6, 0], [6, -7], [6, 7]]) { ctx.moveTo(dx + 2.2, dy); ctx.arc(dx, dy, 2.2, 0, Math.PI * 2); }
      ctx.moveTo(-4, -1); ctx.lineTo(4, -6); ctx.moveTo(-4, 1); ctx.lineTo(4, 6); ctx.stroke();
    } else if (name === "check") {
      ctx.moveTo(-8, 0); ctx.lineTo(-2, 6); ctx.lineTo(9, -7); ctx.stroke();
    } else if (name === "close") {
      ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
    } else if (name === "eye") {
      ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, -9, 9, 0); ctx.quadraticCurveTo(0, 9, -9, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (name === "plus") {
      ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
    } else if (name === "minus") {
      ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
    } else if (name === "seal") {
      ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.font = "600 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("令", 0, 0.5);
    } else if (name === "back") {
      ctx.moveTo(6, -8); ctx.lineTo(-3, 0); ctx.lineTo(6, 8); ctx.stroke();
    } else if (name === "more") {
      for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.arc(dx, 0, 1.5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  drawLogo(x, y, size) {
    if (this.logo?.width) {
      this.ctx.drawImage(this.logo, x, y, size, size);
    } else {
      this.panel(x, y, size, size, COLORS.ink, null, 8);
      this.text("令", x + size / 2, y + size / 2, Math.round(size * 0.5), COLORS.red, "center", "700");
    }
  }

  drawHome(model) {
    const ctx = this.ctx;
    const center = this.width / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(57,115,91,0.25)";
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(28, 112);
    ctx.bezierCurveTo(95, 42, 188, 160, this.width - 26, 78);
    ctx.stroke();
    ctx.restore();
    for (const [x, y, color] of [[30, 112, COLORS.red], [this.width - 28, 78, COLORS.jade]]) {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 3; ctx.stroke();
    }

    this.drawLogo(center - 40, this.safeTop + 52, 80);
    this.text("游侠密令", center, this.safeTop + 156, 30, COLORS.ink, "center", "700");
    this.text("旅行中的隐秘任务", center, this.safeTop + 188, 14, COLORS.muted, "center", "400");

    const panelY = this.safeTop + 230;
    this.panel(20, panelY, this.width - 40, 126, COLORS.paper, COLORS.line, 8);
    this.text("房间人数", 40, panelY + 28, 14, COLORS.muted, "left", "500");
    this.text("开局后锁定", this.width - 40, panelY + 28, 12, COLORS.muted, "right", "400");
    this.button({ x: 40, y: panelY + 56, width: 48, height: 46, label: "", action: "capacity_down", kind: "secondary", icon: "minus", disabled: model.desiredCapacity <= 3 });
    this.text(`${model.desiredCapacity} 人`, center, panelY + 79, 22, COLORS.ink, "center", "700");
    this.button({ x: this.width - 88, y: panelY + 56, width: 48, height: 46, label: "", action: "capacity_up", kind: "secondary", icon: "plus", disabled: model.desiredCapacity >= 12 });

    const buttonY = panelY + 152;
    this.button({ x: 20, y: buttonY, width: this.width - 40, height: 54, label: "创建密令房", action: "create_room", icon: "users" });
    this.button({ x: 20, y: buttonY + 66, width: this.width - 40, height: 54, label: model.inviteCode ? `加入房间 ${model.inviteCode}` : "输入房间号", action: "join_room", kind: "secondary", icon: "seal" });
    this.hit("show_rules", center - 70, buttonY + 136, 140, 40);
    this.text("规则与安全边界", center, buttonY + 156, 13, COLORS.blue, "center", "500");
    this.text("v1 · 微信小游戏版", center, this.height - this.safeBottom - 22, 11, "#929a97", "center", "400");
  }

  drawHeader(model, title = "游侠密令") {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255,253,247,0.97)";
    ctx.fillRect(0, 0, this.width, this.headerHeight);
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath(); ctx.moveTo(0, this.headerHeight - 0.5); ctx.lineTo(this.width, this.headerHeight - 0.5); ctx.stroke();
    this.hit("noop", 0, 0, this.width, this.headerHeight);
    this.drawLogo(16, this.safeTop + 10, 40);
    this.text(title, 66, this.safeTop + 24, 17, COLORS.ink, "left", "700");
    if (model.room) {
      const online = model.room.players.filter((player) => player.online).length;
      this.text(`${model.room.roomCode} · ${online}在线`, 66, this.safeTop + 44, 11, COLORS.muted, "left", "400");
      this.icon("more", this.width - 30, this.safeTop + 30, COLORS.ink, 20);
      this.hit("room_menu", this.width - 54, this.safeTop + 6, 48, 48);
    }
  }

  drawLobby(model) {
    this.drawHeader(model, "同行集结");
    const room = model.room;
    const contentTop = this.headerHeight + 18;
    this.text("房间号", 20, contentTop + 10, 12, COLORS.muted, "left", "500");
    this.text(room.roomCode, 20, contentTop + 44, 32, COLORS.ink, "left", "700");
    this.button({ x: this.width - 132, y: contentTop + 18, width: 112, height: 44, label: "邀请同行", action: "share_room", kind: "secondary", icon: "share" });

    const routeY = contentTop + 94;
    this.panel(20, routeY, this.width - 40, 58, COLORS.jadeSoft, "#b8d2c2", 8);
    this.text(`${room.players.length} / ${room.maxPlayers}`, 40, routeY + 21, 20, COLORS.jadeDark, "left", "700");
    this.text(room.players.length >= 3 ? "可以开局" : `还需 ${3 - room.players.length} 人`, 40, routeY + 42, 12, COLORS.jadeDark, "left", "500");
    const barX = 132;
    const barWidth = this.width - barX - 40;
    this.roundRect(barX, routeY + 25, barWidth, 8, 4); this.ctx.fillStyle = "rgba(40,83,67,0.15)"; this.ctx.fill();
    this.roundRect(barX, routeY + 25, barWidth * Math.min(1, room.players.length / room.maxPlayers), 8, 4); this.ctx.fillStyle = COLORS.jade; this.ctx.fill();

    this.text("同行名单", 20, routeY + 186 - 12, 15, COLORS.ink, "left", "700");
    const cardWidth = (this.width - 52) / 3;
    room.players.forEach((player, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const x = 20 + col * (cardWidth + 6);
      const y = routeY + 198 + row * 86;
      this.panel(x, y, cardWidth, 76, COLORS.paper, COLORS.line, 8);
      this.text(String(player.seat), x + 18, y + 20, 12, player.online ? COLORS.jade : COLORS.muted, "center", "700");
      this.ctx.beginPath(); this.ctx.arc(x + 18, y + 20, 12, 0, Math.PI * 2); this.ctx.strokeStyle = player.online ? COLORS.jade : COLORS.line; this.ctx.stroke();
      this.wrapText(player.name, x + 10, y + 48, cardWidth - 20, 16, 1, { size: 13, align: "left", weight: "600" });
      if (player.id === room.ownerPlayerId) this.text("房主", x + cardWidth - 10, y + 18, 10, COLORS.gold, "right", "600");
    });

    const rows = Math.ceil(room.players.length / 3);
    const actionY = Math.max(this.height - this.safeBottom - 76, routeY + 214 + rows * 86);
    if (room.self.isOwner) {
      this.button({ x: 20, y: actionY, width: this.width - 40, height: 52, label: "开始旅程", action: "start_room", icon: "dice", disabled: room.players.length < 3 });
    } else {
      this.panel(20, actionY, this.width - 40, 52, COLORS.paperWarm, "#e2d4b5", 8);
      this.text("等待房主发出第一道密令", this.width / 2, actionY + 26, 14, "#755d34", "center", "500");
    }
  }

  drawScoreStrip(model, y) {
    const self = model.room.players.find((player) => player.id === model.room.self.id);
    const values = [
      ["总分", self?.totalScore || 0],
      ["今日", model.todayApprovedScore],
      ["剩余", model.remainingDraws],
    ];
    this.panel(20, y, this.width - 40, 72, COLORS.paper, COLORS.line, 8);
    const cell = (this.width - 40) / 3;
    values.forEach(([label, value], index) => {
      if (index) {
        this.ctx.beginPath(); this.ctx.moveTo(20 + index * cell, y + 14); this.ctx.lineTo(20 + index * cell, y + 58);
        this.ctx.strokeStyle = COLORS.line; this.ctx.stroke();
      }
      this.text(label, 20 + cell * index + cell / 2, y + 22, 11, COLORS.muted, "center", "500");
      this.text(value, 20 + cell * index + cell / 2, y + 49, 23, COLORS.ink, "center", "700");
    });
  }

  drawWoodBoard(x, y, width, height, task) {
    const ctx = this.ctx;
    this.roundRect(x, y, width, height, 8); ctx.fillStyle = COLORS.woodDark; ctx.fill();
    this.roundRect(x + 5, y + 5, width - 10, height - 10, 6); ctx.fillStyle = COLORS.wood; ctx.fill();
    ctx.save();
    ctx.strokeStyle = "rgba(55,35,22,0.22)";
    ctx.lineWidth = 1;
    for (let gy = y + 18; gy < y + height - 10; gy += 20) {
      ctx.beginPath(); ctx.moveTo(x + 12, gy); ctx.bezierCurveTo(x + width * 0.35, gy - 5, x + width * 0.7, gy + 6, x + width - 12, gy - 1); ctx.stroke();
    }
    ctx.restore();
    for (const [sx, sy] of [[x + 13, y + 13], [x + width - 13, y + 13], [x + 13, y + height - 13], [x + width - 13, y + height - 13]]) {
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fillStyle = COLORS.goldSoft; ctx.fill();
    }
    this.panel(x + 18, y + 18, width - 36, height - 36, COLORS.paperWarm, "#d8c8a5", 4);

    if (!task.revealed) {
      this.icon("seal", x + width / 2, y + height / 2 - 18, COLORS.red, 52);
      this.text("点击揭令", x + width / 2, y + height / 2 + 28, 15, COLORS.redDark, "center", "600");
      this.text("注意遮挡屏幕", x + width / 2, y + height / 2 + 51, 11, "#846f50", "center", "400");
      this.hit("toggle_task", x + 18, y + 18, width - 36, height - 36);
      return;
    }

    this.text(`${task.score} 分密令`, x + 34, y + 40, 12, task.score === 3 ? COLORS.redDark : COLORS.jadeDark, "left", "700");
    this.text(task.code, x + width - 34, y + 40, 11, "#8d8066", "right", "500");
    this.wrapText(task.description, x + 34, y + 84, width - 68, 28, 5, { size: 18, color: COLORS.ink, weight: "600" });
    this.text(`目标 ${task.targetName}`, x + 34, y + height - 54, 12, "#735f43", "left", "500");
    this.text("点击木板可重新遮住", x + width - 34, y + height - 54, 10, "#8d8066", "right", "400");
    this.hit("toggle_task", x + 18, y + 18, width - 36, height - 36);
  }

  drawApprovalCard(claim, y) {
    this.panel(20, y, this.width - 40, 112, COLORS.blueSoft, "#b8cfdb", 8);
    this.text("待你见证", 36, y + 21, 11, COLORS.blue, "left", "700");
    this.text(`${claim.playerSeat}号 · ${claim.playerName}`, 36, y + 48, 15, COLORS.ink, "left", "600");
    this.text(`${claim.taskCode} · ${claim.points} 分 · 目标 ${claim.targetName}`, 36, y + 69, 11, COLORS.muted, "left", "400");
    this.button({ x: this.width - 166, y: y + 80, width: 62, height: 28, label: "驳回", action: "reject_claim", payload: claim.id, kind: "danger" });
    this.button({ x: this.width - 96, y: y + 80, width: 76, height: 28, label: "确认", action: "approve_claim", payload: claim.id, kind: "primary" });
  }

  drawMissions(model) {
    this.drawHeader(model, "今日密令");
    const offset = -this.currentScroll();
    let y = this.headerHeight + 16 + offset;
    this.drawScoreStrip(model, y);
    y += 88;

    for (const claim of model.room.pendingApprovals.slice(0, 3)) {
      this.drawApprovalCard(claim, y);
      y += 122;
    }

    if (model.activeTask) {
      this.drawWoodBoard(20, y, this.width - 40, 300, model.activeTask);
      y += 314;
      this.text(`剩余 ${model.taskTimeLeft}`, 20, y + 10, 12, COLORS.muted, "left", "500");
      this.button({ x: 20, y: y + 30, width: 104, height: 48, label: "放弃", action: "abandon_task", kind: "danger", icon: "close" });
      this.button({ x: 134, y: y + 30, width: this.width - 154, height: 48, label: "完成并请见证", action: "complete_task", icon: "check" });
      y += 96;
    } else {
      this.drawEmptyMission(model, y);
      y += 276;
    }

    this.text("最近记录", 20, y + 10, 15, COLORS.ink, "left", "700");
    y += 30;
    const records = model.history.slice(0, 8);
    if (!records.length) {
      this.text("还没有任务记录", 20, y + 18, 13, COLORS.muted, "left", "400");
      y += 44;
    }
    for (const record of records) {
      this.panel(20, y, this.width - 40, 62, COLORS.paper, COLORS.line, 8);
      const statusColor = record.status === "approved" ? COLORS.jade : record.status === "pending" ? COLORS.gold : COLORS.muted;
      this.text(record.code, 34, y + 21, 13, COLORS.ink, "left", "600");
      this.text(model.statusLabel(record.status), this.width - 34, y + 21, 11, statusColor, "right", "600");
      this.text(`${record.score} 分 · ${record.targetName}`, 34, y + 43, 11, COLORS.muted, "left", "400");
      y += 70;
    }
    this.maxScroll = Math.max(0, y - offset - (this.height - this.navHeight - 12));
    this.drawNav(model);
    this.drawHeader(model, "今日密令");
  }

  drawEmptyMission(model, y) {
    this.panel(20, y, this.width - 40, 250, COLORS.paper, COLORS.line, 8);
    this.icon("seal", this.width / 2, y + 72, model.remainingDraws ? COLORS.red : COLORS.muted, 52);
    const title = model.remainingDraws ? "抽取一份私密任务" : "今日密令已抽完";
    this.text(title, this.width / 2, y + 122, 19, COLORS.ink, "center", "700");
    this.text(model.remainingDraws ? `今天还有 ${model.remainingDraws} 次机会` : "明天再来，或等待复盘", this.width / 2, y + 150, 12, COLORS.muted, "center", "400");
    this.button({ x: 54, y: y + 178, width: this.width - 108, height: 50, label: "随机抽取", action: "draw_task", icon: "dice", disabled: model.remainingDraws <= 0 });
  }

  drawNav(model) {
    const y = this.height - this.navHeight;
    this.ctx.fillStyle = "rgba(255,253,247,0.98)";
    this.ctx.fillRect(0, y, this.width, this.navHeight);
    this.ctx.beginPath(); this.ctx.moveTo(0, y + 0.5); this.ctx.lineTo(this.width, y + 0.5); this.ctx.strokeStyle = COLORS.line; this.ctx.stroke();
    const items = [
      ["missions", "密令", "dice"],
      ["ranking", "总榜", "rank"],
      ["review", model.room.status === "review" ? "复盘中" : "复盘", "review"],
    ];
    const width = this.width / items.length;
    items.forEach(([screen, label, icon], index) => {
      const active = model.screen === screen;
      const center = width * index + width / 2;
      this.icon(icon, center, y + 24, active ? COLORS.jade : COLORS.muted, 21);
      this.text(label, center, y + 49, 11, active ? COLORS.jade : COLORS.muted, "center", active ? "700" : "500");
      if (screen === "review" && model.room.pendingApprovals.length) {
        this.ctx.beginPath(); this.ctx.arc(center + 15, y + 13, 8, 0, Math.PI * 2); this.ctx.fillStyle = COLORS.red; this.ctx.fill();
        this.text(model.room.pendingApprovals.length, center + 15, y + 13, 9, COLORS.white, "center", "700");
      }
      this.hit("navigate", width * index, y, width, 64, screen);
    });
  }

  drawRanking(model) {
    this.drawHeader(model, model.room.status === "ended" ? "旅程终榜" : "同行总榜");
    const offset = -this.currentScroll();
    let y = this.headerHeight + 18 + offset;
    this.panel(20, y, this.width - 40, 62, model.room.status === "ended" ? COLORS.goldSoft : COLORS.jadeSoft, null, 8);
    this.text(STATUS_LABELS[model.room.status], 36, y + 22, 12, model.room.status === "ended" ? "#71521c" : COLORS.jadeDark, "left", "600");
    this.text(`${model.room.players.length} 位同行`, 36, y + 43, 11, COLORS.muted, "left", "400");
    this.text("得分", this.width - 36, y + 32, 12, COLORS.muted, "right", "500");
    y += 78;

    model.ranking.forEach((player, index) => {
      const height = index < 3 ? 74 : 64;
      const fill = index === 0 ? COLORS.goldSoft : COLORS.paper;
      this.panel(20, y, this.width - 40, height, fill, index === 0 ? "#ddc38c" : COLORS.line, 8);
      const rankColor = index === 0 ? COLORS.gold : index === 1 ? COLORS.blue : index === 2 ? COLORS.red : COLORS.muted;
      this.ctx.beginPath(); this.ctx.arc(46, y + height / 2, 15, 0, Math.PI * 2); this.ctx.fillStyle = rankColor; this.ctx.fill();
      this.text(index + 1, 46, y + height / 2, 13, COLORS.white, "center", "700");
      this.text(`${player.seat}号 · ${player.name}`, 72, y + height / 2 - 10, 14, COLORS.ink, "left", "600");
      const stateLabel = player.present === false ? "暂离本轮" : player.online ? "在线" : "在场";
      this.text(stateLabel, 72, y + height / 2 + 13, 10, player.present === false ? COLORS.red : player.online ? COLORS.jade : COLORS.muted, "left", "500");
      this.text(player.totalScore, this.width - 40, y + height / 2, 24, COLORS.ink, "right", "700");
      y += height + 8;
    });

    if (model.room.self.isOwner && model.room.status === "playing") {
      this.button({ x: 20, y: y + 8, width: this.width - 40, height: 48, label: "进入今日复盘", action: "enter_review", kind: "secondary", icon: "review" });
      y += 68;
    }
    if (model.room.self.isOwner && model.room.status !== "ended") {
      this.hit("end_room", this.width / 2 - 70, y + 6, 140, 40);
      this.text("结束整段旅程", this.width / 2, y + 26, 12, COLORS.redDark, "center", "500");
      y += 54;
    }
    this.maxScroll = Math.max(0, y - offset - (this.height - this.navHeight - 12));
    if (model.room.status !== "ended") this.drawNav(model);
    else {
      this.button({ x: 20, y: this.height - this.safeBottom - 62, width: this.width - 40, height: 50, label: "返回首页", action: "leave_local", kind: "dark", icon: "back" });
    }
    this.drawHeader(model, model.room.status === "ended" ? "旅程终榜" : "同行总榜");
    if (model.room.status === "ended") {
      if (model.room.self.isOwner) {
        this.hit("delete_room", this.width - 122, this.safeTop + 7, 68, 48);
        this.text("删数据", this.width - 64, this.safeTop + 31, 10, COLORS.redDark, "right", "600");
      }
    }
  }

  drawReview(model) {
    this.drawHeader(model, "每日复盘");
    const offset = -this.currentScroll();
    let y = this.headerHeight + 18 + offset;
    if (model.room.status !== "review") {
      this.panel(20, y, this.width - 40, 154, COLORS.paper, COLORS.line, 8);
      this.icon("review", this.width / 2, y + 44, COLORS.blue, 32);
      this.text("尚未进入复盘", this.width / 2, y + 83, 18, COLORS.ink, "center", "700");
      this.text("房主可从总榜开启今日复盘", this.width / 2, y + 111, 12, COLORS.muted, "center", "400");
      if (model.room.self.isOwner) this.button({ x: 54, y: y + 166, width: this.width - 108, height: 48, label: "开启复盘", action: "enter_review", icon: "review" });
      y += 232;
    } else {
      this.panel(20, y, this.width - 40, 66, COLORS.blueSoft, "#b8cfdb", 8);
      this.text(model.reviewDateLabel, 36, y + 22, 13, COLORS.blue, "left", "700");
      this.text(`${model.room.reviews.length}/${model.room.players.length} 人已复盘`, 36, y + 45, 11, COLORS.muted, "left", "400");
      this.button({ x: this.width - 116, y: y + 11, width: 96, height: 44, label: model.myReview ? "修改" : "选择", action: "write_review", kind: "secondary" });
      y += 82;

      const notes = model.room.reviews;
      if (!notes.length) {
        this.text("等待大家选择今日印象", 20, y + 18, 13, COLORS.muted, "left", "400");
        y += 48;
      }
      for (const review of notes) {
        const height = 86;
        this.panel(20, y, this.width - 40, height, review.isWinner ? COLORS.goldSoft : COLORS.paper, review.isWinner ? "#ddc38c" : COLORS.line, 8);
        this.text(`${review.playerSeat}号 · ${review.playerName}`, 34, y + 21, 13, COLORS.ink, "left", "600");
        if (review.isWinner) this.text("最佳妙计 +1", this.width - 34, y + 21, 11, "#71521c", "right", "700");
        this.wrapText(review.note || "已完成复盘", 34, y + 48, this.width - 68, 19, 2, { size: 12, color: COLORS.muted });
        y += height + 8;
      }

      if (model.room.self.isOwner) {
        const hasWinner = notes.some((item) => item.isWinner);
        this.button({ x: 20, y: y + 6, width: this.width - 40, height: 48, label: hasWinner ? "今日最佳已选" : "选择今日最佳", action: "award_review", kind: "gold", icon: "seal", disabled: hasWinner || !notes.length });
        this.button({ x: 20, y: y + 64, width: this.width - 40, height: 48, label: "完成复盘，继续旅程", action: "resume_room", icon: "check" });
        y += 130;
      }
    }
    this.maxScroll = Math.max(0, y - offset - (this.height - this.navHeight - 12));
    this.drawNav(model);
    this.drawHeader(model, "每日复盘");
  }

  drawPicker(picker) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(20,29,31,0.58)";
    ctx.fillRect(0, 0, this.width, this.height);
    const cols = picker.options.length > 6 ? 2 : 1;
    const rows = Math.ceil(picker.options.length / cols);
    const width = this.width - 32;
    const rowHeight = 48;
    const height = 72 + rows * rowHeight + 62;
    const y = Math.max(this.safeTop + 16, (this.height - height) / 2);
    this.panel(16, y, width, height, COLORS.paper, null, 8);
    this.text(picker.title, 34, y + 31, 17, COLORS.ink, "left", "700");
    this.icon("close", this.width - 42, y + 31, COLORS.muted, 18);
    this.hit("close_picker", this.width - 66, y + 8, 48, 46);
    const gap = 8;
    const itemWidth = cols === 2 ? (width - 52) / 2 : width - 36;
    picker.options.forEach((option, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = 34 + col * (itemWidth + gap);
      const itemY = y + 58 + row * rowHeight;
      this.panel(x, itemY, itemWidth, 40, COLORS.canvas, COLORS.line, 6);
      this.text(option.label, x + 12, itemY + 20, 13, COLORS.ink, "left", "600");
      this.hit("picker_select", x, itemY, itemWidth, 40, option.value);
    });
    this.text(picker.help || "选择后立即提交", this.width / 2, y + height - 28, 11, COLORS.muted, "center", "400");
  }

  drawToast(message) {
    const width = Math.min(this.width - 40, Math.max(170, String(message).length * 14 + 34));
    const y = this.height - this.navHeight - 64;
    this.panel((this.width - width) / 2, y, width, 42, COLORS.ink, null, 8);
    this.text(message, this.width / 2, y + 21, 13, COLORS.white, "center", "500");
  }

  drawBusy() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(237,241,237,0.62)";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.beginPath(); ctx.arc(this.width / 2, this.height / 2, 21, 0, Math.PI * 2); ctx.fillStyle = COLORS.ink; ctx.fill();
    this.text("···", this.width / 2, this.height / 2 - 2, 16, COLORS.white, "center", "700");
  }
}

module.exports = { COLORS, GameRenderer };

}};
const cache={};
function __require(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};modules[id](module,module.exports,__require);return module.exports;}
__require(0);
})();
