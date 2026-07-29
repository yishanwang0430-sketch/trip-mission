const api = require("./api");
const config = require("./config");
const { dateKey, drawMission } = require("./tasks");
const { deviceToken, loadState, saveState } = require("./storage");
const { GameRenderer } = require("./ui");

const RECORD_STATUS = {
  submit_pending: "待上传",
  sync_error: "待联网",
  pending: "待见证",
  approved: "已计分",
  rejected: "未通过",
  abandoned: "已放弃",
  expired: "已超时",
};

const REVIEW_PRESETS = ["最好笑的一次", "最巧妙的一次", "最默契的一次", "最意外的一次", "今天很顺利", "期待明天继续"];
const HIDDEN_TASK_FORBIDDEN = /(亲吻|接吻|脱衣|裸露|打人|踢人|推人|绊倒|灌酒|喝酒|抽烟|药物|转账|付款|密码|证件|护照|行李|偷拿|偷拍|陌生人|开车|驾驶|闯红灯|攀爬|高处|下水|游泳|违法|侮辱|辱骂|歧视|性行为|赌博)/i;

function normalizePlayerName(value) {
  const name = String(value || "").trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 12) return null;
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function validateHiddenTask(value) {
  const description = String(value || "").trim().replace(/\s+/g, " ");
  if (Array.from(description).length < 8 || Array.from(description).length > 80 || /[\u0000-\u001f\u007f]/.test(description)) {
    return { value: null, error: "请填写 8–80 个字符的完整任务" };
  }
  if (HIDDEN_TASK_FORBIDDEN.test(description)) {
    return { value: null, error: "内容涉及安全、隐私或他人边界，请重新设计" };
  }
  return { value: description, error: "" };
}

function buildHiddenMission(task, now = Date.now()) {
  if (!task?.uid || task.taskId !== "X01" || task.score !== 3 || !task.description) {
    throw new Error("隐藏任务数据无效，请稍后重试");
  }
  return {
    uid: task.uid,
    taskId: "X01",
    code: task.code,
    score: 3,
    targetId: null,
    targetName: task.targetName || "本轮隐藏任务",
    randomWords: [],
    description: task.description,
    isHidden: true,
    drawnAt: now,
    expiresAt: now + config.taskExpiryMs,
    playedOn: dateKey(new Date(now)),
    revealed: false,
  };
}

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
    else if (room.status === "lobby" && this.screen !== "hidden_editor") this.screen = "lobby";
    else if (room.status === "review" && oldStatus !== "review") this.screen = "review";
    else if (room.status === "ended") this.screen = "ranking";
    else if (room.status === "playing" && ["home", "lobby", "hidden_editor"].includes(this.screen)) this.screen = "missions";
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

  async requestPlayerName() {
    const entered = await promptText("设置玩家昵称", "输入 1–12 个字符", this.local.profileName);
    if (entered === null) return null;
    const name = normalizePlayerName(entered);
    if (!name) this.showToast("请输入 1–12 个字符的昵称");
    return name;
  }

  async createRoom() {
    const name = await this.requestPlayerName();
    if (!name) return;
    await this.finishCreateRoom(name);
  }

  async finishCreateRoom(name) {
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
    const name = await this.requestPlayerName();
    if (!name) return;
    await this.finishJoinRoom(name);
  }

  async finishJoinRoom(name) {
    const code = this.pendingJoinCode;
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
      this.setRoom(room);
      if (room.hiddenTask?.isEditor) {
        this.screen = "hidden_editor";
        this.renderer.resetScroll("hidden_editor");
        this.render();
        this.showToast("你被抽中设计本房隐藏任务");
      } else {
        this.showToast("隐藏任务设计者已抽出，提交后自动开局");
      }
    });
  }

  openHiddenEditor() {
    if (!this.room?.hiddenTask?.isEditor || this.room.hiddenTask.status !== "editing") {
      return this.showToast("你不是本轮隐藏任务设计者");
    }
    this.screen = "hidden_editor";
    this.renderer.resetScroll("hidden_editor");
    this.render();
  }

  closeHiddenEditor() {
    this.screen = "lobby";
    this.renderer.resetScroll("lobby");
    this.render();
  }

  async editHiddenTask() {
    if (!this.room?.hiddenTask?.isEditor || this.room.hiddenTask.status !== "editing") {
      return this.showToast("隐藏任务已经锁定");
    }
    const entered = await promptText(
      "填写隐藏任务",
      "8–80 字，例如：让任意同行主动提议拍一张合照",
    );
    if (entered === null) return;
    const checked = validateHiddenTask(entered);
    if (!checked.value) return this.showToast(checked.error);
    const accepted = await confirm(
      "确认提交隐藏任务？",
      `${checked.value}\n\n提交后不可修改；设计者本人不会抽到。`,
      "确认提交",
    );
    if (!accepted) return;
    await this.runBusy(async () => {
      const room = await api.submitHiddenTask(this.room.roomCode, this.token, checked.value);
      this.setRoom(room, "missions");
      this.showToast("隐藏任务已混入任务池，旅程开始");
    });
  }

  async drawTask() {
    if (!this.room) return this.showToast("房间尚未同步，请稍后再试");
    if (this.room.status !== "playing") return this.showToast("当前不在密令阶段");
    if (this.local.activeTask) return this.showToast("请先完成当前密令");
    const model = this.model();
    if (model.remainingDraws <= 0) return this.showToast("今日抽取次数已用完");
    try {
      const presentPlayers = this.room.players.filter((player) => player.present !== false);
      if (!presentPlayers.some((player) => player.id === this.room.self.id)) {
        return this.showToast("请先在房间菜单中重新归队");
      }
      const hidden = this.room.hiddenTask;
      const hiddenAlreadyKnown = hidden?.taskUid && (
        this.local.activeTask?.uid === hidden.taskUid
        || this.local.history.some((record) => record.uid === hidden.taskUid)
      );
      if (hidden?.availableForSelf && hidden.taskUid && !hiddenAlreadyKnown) {
        await this.runBusy(async () => {
          const result = await api.takeHiddenTask(this.room.roomCode, this.token);
          this.local.activeTask = buildHiddenMission(result.task);
          saveState(this.local);
          this.setRoom(result.room, "missions");
          this.showToast("你抽中了本轮唯一的隐藏任务");
        });
        return;
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
    const items = ["修改昵称", "复制房间号", "分享给同行", presenceLabel, "规则与安全边界", "退出本机"];
    wx.showActionSheet({
      itemList: items,
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.editName();
        else if (tapIndex === 1) wx.setClipboardData?.({ data: this.room.roomCode });
        else if (tapIndex === 2) this.shareRoom();
        else if (tapIndex === 3) this.togglePresence(self?.present === false);
        else if (tapIndex === 4) this.showRules();
        else if (tapIndex === 5) this.leaveLocal();
      },
    });
  }

  async editName() {
    const name = await this.requestPlayerName();
    if (!name || name === this.room?.self?.name) return;
    await this.runBusy(async () => {
      const room = await api.updateName(this.room.roomCode, this.token, name);
      this.setRoom(room);
      this.showToast("昵称已更新");
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
      content: "每天可抽 2 次密令，每次限时 2 小时。每个新房间会随机选出一名隐藏任务设计者，任务仅由另一名玩家抽到。完成后指定同行见证。不要执行危险、冒犯、违法、涉及隐私财物或影响陌生人的任务；任何人不舒服都应立即停止。",
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
      open_hidden_editor: () => this.openHiddenEditor(),
      close_hidden_editor: () => this.closeHiddenEditor(),
      edit_hidden_task: () => this.editHiddenTask(),
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
      },
    };
    return actions[action]?.();
  }
}

module.exports = {
  TravelSecretGame,
  RECORD_STATUS,
  REVIEW_PRESETS,
  normalizePlayerName,
  validateHiddenTask,
  buildHiddenMission,
  formatReviewDate,
  timeLeft,
};
