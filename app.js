const STORAGE_KEY = "travel-secret-missions-v1";
const PLAYER_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"];
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

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function createDefaultState() {
  return {
    version: 1,
    selfId: null,
    roster: PLAYER_IDS.map((id) => ({
      id,
      name: `玩家${id}`,
      active: ["A", "C", "D", "E"].includes(id),
    })),
    settings: { dailyLimit: 2, reviewTime: "21:30", scoresHidden: false },
    activeTask: null,
    history: [],
    attendance: {},
    reviews: {},
    leaderboard: Object.fromEntries(PLAYER_IDS.map((id) => [id, { total: 0, days: 0 }])),
  };
}

function loadState() {
  const defaults = createDefaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 1) return defaults;
    return {
      ...defaults,
      ...saved,
      settings: { ...defaults.settings, ...saved.settings },
      roster: PLAYER_IDS.map((id) => ({
        ...defaults.roster.find((p) => p.id === id),
        ...(saved.roster || []).find((p) => p.id === id),
      })),
      leaderboard: { ...defaults.leaderboard, ...(saved.leaderboard || {}) },
      attendance: saved.attendance || {},
      reviews: saved.reviews || {},
      history: Array.isArray(saved.history) ? saved.history : [],
    };
  } catch {
    return defaults;
  }
}

let state = loadState();
let onboardingSelection = state.selfId || "A";
let confirmAction = null;
let toastTimer = null;
let syncingScores = false;
const pendingInviteCode = new URL(location.href).searchParams.get("room")?.replace(/\D/g, "").slice(0, 6) || "";
let roomSnapshot = window.tripRooms?.snapshot?.() || {
  available: false,
  connected: false,
  status: "unavailable",
  session: null,
  players: [],
  onlinePlayerIds: [],
  reviewsByDate: {},
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function randomUnit() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 4294967296;
}

function randomItem(items) {
  return items[Math.floor(randomUnit() * items.length)];
}

function makeId(prefix = "task") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(randomUnit() * 1679616).toString(36).padStart(4, "0")}`;
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function formatDate(key, options = { month: "long", day: "numeric", weekday: "short" }) {
  return new Intl.DateTimeFormat("zh-CN", options).format(parseDateKey(key));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function playerById(id) {
  return state.roster.find((player) => player.id === id);
}

function playerLabel(id) {
  const player = playerById(id);
  if (!player) return id || "未知";
  return player.name && player.name !== `玩家${id}` ? `${id} · ${player.name}` : `玩家 ${id}`;
}

function activePlayers() {
  return state.roster.filter((player) => player.active);
}

function recordsFor(key) {
  return state.history.filter((record) => record.dateKey === key);
}

function reviewFor(key) {
  if (!state.reviews[key]) state.reviews[key] = { bonus: false, note: "", reviewed: false };
  return state.reviews[key];
}

function scoreFor(key) {
  const taskPoints = recordsFor(key)
    .filter((record) => record.status === "completed")
    .reduce((sum, record) => sum + record.score, 0);
  return taskPoints + (state.reviews[key]?.bonus ? 1 : 0);
}

function totalScore() {
  const taskPoints = state.history
    .filter((record) => record.status === "completed")
    .reduce((sum, record) => sum + record.score, 0);
  const bonusPoints = Object.values(state.reviews).filter((review) => review.bonus).length;
  return taskPoints + bonusPoints;
}

function attendanceDays() {
  return Object.values(state.attendance).filter(Boolean).length;
}

function isInRoom() {
  return Boolean(roomSnapshot.session);
}

function remoteSelf() {
  if (!roomSnapshot.session) return null;
  return roomSnapshot.players.find((player) => player.id === roomSnapshot.session.playerId) || null;
}

function currentTotalScore() {
  const remote = remoteSelf();
  if (!remote) return totalScore();
  const pending = state.history
    .filter((record) => record.status === "completed" && record.roomCode === roomSnapshot.session.roomCode && record.syncStatus !== "synced")
    .reduce((sum, record) => sum + record.score, 0);
  return Number(remote.totalScore) + pending;
}

function applyRoomSnapshot(nextSnapshot) {
  roomSnapshot = nextSnapshot;
  if (!nextSnapshot.session || !nextSnapshot.players.length) return;
  const onlineIds = new Set(nextSnapshot.onlinePlayerIds);
  state.selfId = nextSnapshot.session.seat;
  state.roster = PLAYER_IDS.map((id) => {
    const existing = state.roster.find((player) => player.id === id) || { id, name: `玩家${id}`, active: false };
    const remote = nextSnapshot.players.find((player) => player.seat === id);
    if (!remote) return { ...existing, name: `玩家${id}`, active: false };
    return {
      ...existing,
      name: remote.name,
      active: remote.id === nextSnapshot.session.playerId || onlineIds.has(remote.id),
    };
  });
  state.leaderboard = Object.fromEntries(nextSnapshot.players.map((player) => [
    player.seat,
    { total: Number(player.totalScore) || 0, days: Number(player.attendanceDays) || 0 },
  ]));
  saveState();
}

function drawsForToday() {
  const today = dateKey();
  return recordsFor(today).length + (state.activeTask?.dateKey === today ? 1 : 0);
}

function remainingDraws() {
  return Math.max(0, state.settings.dailyLimit - drawsForToday());
}

function chooseScore(playerCount) {
  const roll = randomUnit();
  const preferred = roll < 0.52 ? 1 : roll < 0.84 ? 2 : 3;
  if (TASKS.some((task) => task.score === preferred && task.minPlayers <= playerCount)) return preferred;
  return playerCount >= 2 ? 1 : 0;
}

function drawMission() {
  expireTaskIfNeeded();
  if (state.activeTask || remainingDraws() <= 0) return;
  const active = activePlayers();
  const candidates = active.filter((player) => player.id !== state.selfId);
  if (!state.selfId || candidates.length === 0) {
    showToast("至少需要另一名在场玩家");
    return;
  }

  const todayTargets = new Set(recordsFor(dateKey()).map((record) => record.targetId));
  const freshTargets = candidates.filter((player) => !todayTargets.has(player.id));
  const target = randomItem(freshTargets.length ? freshTargets : candidates);
  const otherCandidates = active.filter((player) => player.id !== state.selfId && player.id !== target.id);
  const other = otherCandidates.length ? randomItem(otherCandidates) : target;
  const score = chooseScore(active.length);
  const recentTaskIds = new Set(state.history.slice(-6).map((record) => record.taskId));
  let pool = TASKS.filter((task) => task.score === score && task.minPlayers <= active.length && !recentTaskIds.has(task.id));
  if (!pool.length) pool = TASKS.filter((task) => task.score === score && task.minPlayers <= active.length);
  const task = randomItem(pool);
  const word = randomItem(WORDS);
  let secondWord = randomItem(WORDS.filter((item) => item !== word));
  if (!secondWord) secondWord = "可以";
  const description = task.build({
    target: playerLabel(target.id),
    other: playerLabel(other.id),
    word,
    secondWord,
  });
  const now = Date.now();

  state.activeTask = {
    uid: makeId("mission"),
    taskId: task.id,
    code: `${task.id}-${Math.floor(randomUnit() * 900 + 100)}`,
    score: task.score,
    description,
    targetId: target.id,
    targetName: playerLabel(target.id),
    otherId: other.id,
    createdAt: now,
    expiresAt: now + 2 * 60 * 60 * 1000,
    dateKey: dateKey(),
    revealed: false,
  };
  saveState();
  renderAll();
}

function expireTaskIfNeeded() {
  if (!state.activeTask) return false;
  const expired = Date.now() >= state.activeTask.expiresAt || state.activeTask.dateKey !== dateKey();
  if (!expired) return false;
  resolveActiveTask("expired", null, "任务超时", false);
  return true;
}

function resolveActiveTask(status, witnessId = null, note = "", shouldRender = true) {
  if (!state.activeTask) return;
  const task = state.activeTask;
  const record = {
    ...task,
    status,
    awarded: status === "completed" ? task.score : 0,
    witnessId,
    note,
    resolvedAt: Date.now(),
    roomCode: status === "completed" ? roomSnapshot.session?.roomCode || null : null,
    syncStatus: status === "completed" && roomSnapshot.session ? "pending" : null,
  };
  state.history.push(record);
  state.activeTask = null;
  saveState();
  if (shouldRender) renderAll();
  return record;
}

function revealMission() {
  if (!state.activeTask) return;
  state.activeTask.revealed = true;
  saveState();
  renderMission();
}

function renderHeader() {
  $("#header-date").textContent = formatDate(dateKey());
  document.body.classList.toggle("scores-hidden", state.settings.scoresHidden);
  const button = $("#privacy-toggle");
  button.innerHTML = `<i data-lucide="${state.settings.scoresHidden ? "eye-off" : "eye"}"></i>`;
  button.setAttribute("aria-label", state.settings.scoresHidden ? "显示分数" : "隐藏分数");
  button.title = state.settings.scoresHidden ? "显示分数" : "隐藏分数";
  renderRoomStatus();
}

function renderRoomStatus() {
  const label = $("#room-status-label");
  const dot = $("#connection-dot");
  dot.className = "connection-dot";
  if (roomSnapshot.session) {
    const onlineCount = Math.max(1, roomSnapshot.onlinePlayerIds.length);
    label.textContent = `${roomSnapshot.session.roomCode} · ${onlineCount}在线`;
    dot.classList.add(roomSnapshot.connected ? "is-online" : "is-connecting");
  } else if (roomSnapshot.status === "connecting") {
    label.textContent = "连接中";
    dot.classList.add("is-connecting");
  } else {
    label.textContent = roomSnapshot.available ? "加入房间" : "本机模式";
  }
}

function renderScoreStrip() {
  $("#total-score").textContent = currentTotalScore();
  $("#today-score").textContent = scoreFor(dateKey());
  $("#remaining-draws").textContent = remainingDraws();
}

function renderMission() {
  expireTaskIfNeeded();
  const task = state.activeTask;
  const empty = $("#empty-task");
  const card = $("#active-task");
  const drawButton = $("#draw-task");
  const emptyHeading = $("h1", empty);
  const emptyNote = $("#empty-task-note");

  if (!task) {
    empty.hidden = false;
    card.hidden = true;
    const remaining = remainingDraws();
    const eligible = activePlayers().some((player) => player.id !== state.selfId);
    drawButton.hidden = remaining <= 0;
    drawButton.disabled = !eligible;
    if (remaining <= 0) {
      emptyHeading.textContent = "今天的密令已抽完";
      emptyNote.textContent = `复盘时间 ${state.settings.reviewTime}`;
    } else if (!eligible) {
      emptyHeading.textContent = "等待同行者加入";
      emptyNote.textContent = "请在设置中勾选当前在场玩家";
    } else {
      emptyHeading.textContent = "抽取今天的密令";
      emptyNote.textContent = `当前还有 ${remaining} 次机会`;
    }
    return;
  }

  empty.hidden = true;
  card.hidden = false;
  const badge = $("#task-points");
  badge.textContent = `${task.score} 分`;
  badge.className = `points-badge score-${task.score}`;
  $("#task-target").textContent = `目标：${task.targetName}`;
  $("#task-code").textContent = `密令 ${task.code}`;
  $("#task-title").textContent = task.description;
  $("#task-description").textContent = "触发后 30 秒内说“计成”，并请一名在场玩家确认。";
  const body = $("#mission-body");
  body.classList.toggle("is-concealed", !task.revealed);
  $("#conceal-cover").hidden = task.revealed;
  $("#complete-task").disabled = !task.revealed;
  updateTaskTimer();
}

function updateTaskTimer() {
  if (!state.activeTask) return;
  const remaining = Math.max(0, state.activeTask.expiresAt - Date.now());
  const totalMinutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  $("#task-timer").textContent = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}` : `${minutes} 分`;
}

function recordStatusLabel(status) {
  return {
    completed: "已完成",
    abandoned: "已放弃",
    expired: "已超时",
  }[status] || status;
}

function recordItemHtml(record) {
  const completed = record.status === "completed";
  const statusLabel = completed && record.syncStatus === "pending" ? "待同步" : recordStatusLabel(record.status);
  return `
    <article class="record-item">
      <div class="record-score ${completed ? "" : "is-failed"}">${completed ? `+${record.score}` : "0"}</div>
      <div class="record-main">
        <strong>${escapeHtml(record.taskId)} · ${escapeHtml(record.targetName)}</strong>
        <small>${escapeHtml(record.description)}</small>
      </div>
      <div class="record-time">${statusLabel}<br>${formatTime(record.resolvedAt)}</div>
    </article>
  `;
}

function renderRecentRecords() {
  const records = [...state.history].sort((a, b) => b.resolvedAt - a.resolvedAt).slice(0, 3);
  $("#recent-records").innerHTML = records.length ? records.map(recordItemHtml).join("") : `<div class="empty-list">还没有任务记录</div>`;
}

function renderReview() {
  const picker = $("#review-date");
  if (!picker.value) picker.value = dateKey();
  const key = picker.value;
  const review = reviewFor(key);
  const records = recordsFor(key).sort((a, b) => a.createdAt - b.createdAt);
  const completed = records.filter((record) => record.status === "completed").length;
  const failed = records.length - completed;
  $("#review-date-title").textContent = formatDate(key);
  $("#review-score").textContent = scoreFor(key);
  $("#review-completed").textContent = completed;
  $("#review-failed").textContent = failed;
  $("#review-records").innerHTML = records.length ? records.map(recordItemHtml).join("") : `<div class="empty-list">这一天没有抽取任务</div>`;
  $("#attendance-toggle").checked = Boolean(state.attendance[key]);
  $("#bonus-toggle").checked = Boolean(review.bonus);
  $("#review-note").value = review.note || "";
  $("#finish-review span").textContent = review.reviewed ? "已完成复盘" : "完成复盘";
  renderRoomReviews(key);
}

function renderRoomReviews(key) {
  const section = $("#room-review-section");
  section.hidden = !isInRoom();
  if (!isInRoom()) return;
  const reviews = roomSnapshot.reviewsByDate[key] || [];
  $("#room-review-list").innerHTML = reviews.length ? reviews.map((review) => `
    <article class="room-review-item">
      <span class="roster-code">${escapeHtml(review.seat)}</span>
      <div class="room-review-copy">
        <strong>${escapeHtml(review.name)}</strong>
        <small>${escapeHtml(review.note || (review.reviewed ? "已完成复盘" : "暂无备注"))}</small>
      </div>
      ${review.bonus ? `<span class="review-bonus">+1</span>` : ""}
    </article>
  `).join("") : `<div class="empty-list">还没有同行复盘</div>`;
}

function renderRanking() {
  const onlineIds = new Set(roomSnapshot.onlinePlayerIds);
  const resetButton = $("#reset-ranking");
  if (isInRoom()) {
    resetButton.hidden = true;
    $("#ranking-title").textContent = "房间实时排名";
    const ranked = roomSnapshot.players
      .map((player) => ({
        ...player,
        total: Number(player.totalScore) || 0,
        days: Number(player.attendanceDays) || 0,
        average: Number(player.attendanceDays) > 0 ? Number(player.totalScore) / Number(player.attendanceDays) : 0,
      }))
      .sort((a, b) => b.average - a.average || b.total - a.total || a.seat.localeCompare(b.seat));
    $("#ranking-list").innerHTML = ranked.map((player, index) => {
      const isSelf = player.id === roomSnapshot.session.playerId;
      const isOnline = isSelf || onlineIds.has(player.id);
      return `
        <div class="ranking-row" data-player-id="${player.seat}">
          <div class="rank-player">
            <span class="rank-number">${index + 1}</span>
            <span class="rank-avatar">${escapeHtml(player.seat)}</span>
            <span class="rank-name-wrap"><span class="presence-dot ${isOnline ? "is-online" : ""}"></span><span class="rank-name">${escapeHtml(player.name)}${isSelf ? " · 我" : ""}</span></span>
          </div>
          <span class="rank-score-value rank-score">${player.total}</span>
          <span class="rank-days-value">${player.days}</span>
          <span class="rank-average">${player.average.toFixed(1)}</span>
        </div>
      `;
    }).join("");
    return;
  }

  resetButton.hidden = false;
  $("#ranking-title").textContent = "按场均分排序";
  if (state.selfId) {
    state.leaderboard[state.selfId] = { total: totalScore(), days: attendanceDays() };
  }
  const ranked = state.roster
    .map((player) => {
      const entry = state.leaderboard[player.id] || { total: 0, days: 0 };
      return { ...player, total: Number(entry.total) || 0, days: Number(entry.days) || 0, average: entry.days > 0 ? entry.total / entry.days : 0 };
    })
    .sort((a, b) => b.average - a.average || b.total - a.total || a.id.localeCompare(b.id));

  $("#ranking-list").innerHTML = ranked.map((player, index) => {
    const isSelf = player.id === state.selfId;
    return `
      <div class="ranking-row" data-player-id="${player.id}">
        <div class="rank-player">
          <span class="rank-number">${index + 1}</span>
          <span class="rank-avatar">${player.id}</span>
          <span class="rank-name">${escapeHtml(player.name)}${isSelf ? " · 我" : ""}</span>
        </div>
        <input class="rank-input rank-score" type="number" min="0" max="999" inputmode="numeric" value="${player.total}" data-rank-field="total" ${isSelf ? "disabled" : ""} aria-label="${escapeHtml(player.name)}总分" />
        <input class="rank-input" type="number" min="0" max="99" inputmode="numeric" value="${player.days}" data-rank-field="days" ${isSelf ? "disabled" : ""} aria-label="${escapeHtml(player.name)}在场日" />
        <span class="rank-average">${player.average.toFixed(1)}</span>
      </div>
    `;
  }).join("");
}

function renderSettings() {
  const selfSelect = $("#self-player");
  selfSelect.innerHTML = state.roster.map((player) => `<option value="${player.id}">${escapeHtml(playerLabel(player.id))}</option>`).join("");
  selfSelect.value = state.selfId || "A";
  selfSelect.disabled = isInRoom();
  $("#self-name").value = state.selfId ? playerById(state.selfId).name : "";
  $("#review-time").value = state.settings.reviewTime;
  $$("#daily-limit-control button").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.limit) === state.settings.dailyLimit);
  });

  const onlineIds = new Set(roomSnapshot.onlinePlayerIds);
  $("#roster-grid").innerHTML = state.roster.map((player) => {
    const remote = roomSnapshot.players.find((item) => item.seat === player.id);
    const isOnline = remote && (remote.id === roomSnapshot.session?.playerId || onlineIds.has(remote.id));
    return `
    <label class="roster-person ${player.active ? "is-active" : ""}" data-roster-id="${player.id}">
      <span class="roster-code">${player.id}</span>
      <input class="roster-name-input" type="text" maxlength="12" value="${escapeHtml(player.name)}" aria-label="玩家${player.id}姓名" ${isInRoom() ? "disabled" : ""} />
      ${isInRoom() ? `<span class="presence-dot ${isOnline ? "is-online" : ""}" title="${isOnline ? "在线" : "离线"}"></span>` : `<input class="roster-active" type="checkbox" ${player.active ? "checked" : ""} aria-label="${escapeHtml(player.name)}当前在场" />`}
    </label>
  `;
  }).join("");
}

function renderReviewAlert() {
  const now = new Date();
  const [hour, minute] = state.settings.reviewTime.split(":").map(Number);
  const threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  const due = now >= threshold && !state.reviews[dateKey()]?.reviewed;
  $("#review-alert").hidden = !due;
}

function renderOnboarding() {
  const modal = $("#onboarding-modal");
  modal.hidden = Boolean(state.selfId);
  $("#onboarding-player-picker").innerHTML = PLAYER_IDS.map((id) => `
    <button class="player-pick ${id === onboardingSelection ? "is-selected" : ""}" type="button" data-player-pick="${id}">${id}</button>
  `).join("");
}

function renderRoomModal() {
  const connected = isInRoom();
  $("#room-disconnected").hidden = connected;
  $("#room-connected").hidden = !connected;
  if (!connected) {
    if (document.activeElement !== $("#room-player-name")) {
      $("#room-player-name").value = state.selfId ? playerById(state.selfId).name : "";
    }
    const busy = roomSnapshot.status === "connecting";
    $("#create-room").disabled = busy || !roomSnapshot.available;
    $("#join-room").disabled = busy || !roomSnapshot.available;
    const serviceState = $("#room-service-state");
    serviceState.classList.toggle("is-error", Boolean(roomSnapshot.error) || !roomSnapshot.available);
    serviceState.textContent = busy
      ? "正在连接…"
      : roomSnapshot.error || (roomSnapshot.available ? "" : "联机服务尚未配置");
    return;
  }

  const onlineIds = new Set(roomSnapshot.onlinePlayerIds);
  const onlineCount = Math.max(1, onlineIds.size);
  $("#room-code-display").textContent = roomSnapshot.session.roomCode;
  $("#room-online-summary").textContent = `${onlineCount} 人在线 · ${roomSnapshot.players.length}/8 已加入`;
  $("#room-member-list").innerHTML = roomSnapshot.players.map((player) => {
    const isSelf = player.id === roomSnapshot.session.playerId;
    const isOnline = isSelf || onlineIds.has(player.id);
    return `
      <div class="room-member">
        <span class="roster-code">${escapeHtml(player.seat)}</span>
        <span class="room-member-name">${escapeHtml(player.name)}${isSelf ? " · 我" : ""}</span>
        <span class="room-member-state"><span class="presence-dot ${isOnline ? "is-online" : ""}"></span>${isOnline ? "在线" : "离线"}</span>
      </div>
    `;
  }).join("");
}

async function syncPendingRoomScores() {
  if (syncingScores || !roomSnapshot.connected || !roomSnapshot.session) return;
  const pending = state.history.filter((record) =>
    record.status === "completed"
    && record.roomCode === roomSnapshot.session.roomCode
    && record.syncStatus !== "synced"
  );
  if (!pending.length) return;
  syncingScores = true;
  try {
    for (const record of pending) {
      record.syncStatus = "syncing";
      saveState();
      try {
        await window.tripRooms.recordTask(record, record.witnessId);
        record.syncStatus = "synced";
      } catch {
        record.syncStatus = "pending";
        break;
      }
      saveState();
    }
  } finally {
    syncingScores = false;
    saveState();
    renderAll();
  }
}

async function enterRoom(mode) {
  const name = $("#room-player-name").value.trim() || (state.selfId ? playerById(state.selfId).name : "同行玩家");
  try {
    const next = mode === "create"
      ? await window.tripRooms.createRoom(name)
      : await window.tripRooms.joinRoom($("#room-code-input").value, name);
    applyRoomSnapshot(next);
    state.attendance[dateKey()] = true;
    saveState();
    renderAll();
    closeModal("room-modal");
    await window.tripRooms.setAttendance(dateKey(), true).catch(() => {});
    await window.tripRooms.loadReviews(dateKey()).catch(() => {});
    showToast(mode === "create" ? `房间 ${next.session.roomCode} 已创建` : `已加入房间 ${next.session.roomCode}`);
  } catch (error) {
    showToast(error?.message || "加入房间失败");
    renderRoomModal();
  }
}

function renderAll() {
  renderHeader();
  renderScoreStrip();
  renderMission();
  renderRecentRecords();
  renderReview();
  renderRanking();
  renderSettings();
  renderReviewAlert();
  renderOnboarding();
  renderRoomModal();
  if (window.lucide) window.lucide.createIcons();
}

function navigate(viewName) {
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.dataset.view === viewName));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === viewName));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewName === "review") renderReview();
  if (viewName === "ranking") renderRanking();
  if (window.lucide) window.lucide.createIcons();
}

function openCompleteModal() {
  if (!state.activeTask?.revealed) return;
  const witnesses = activePlayers().filter((player) => player.id !== state.selfId);
  $("#witness-select").innerHTML = witnesses.map((player) => `<option value="${player.id}">${escapeHtml(playerLabel(player.id))}</option>`).join("");
  $("#completion-note").value = "";
  $("#complete-modal").hidden = false;
}

function closeModal(id) {
  $(`#${id}`).hidden = true;
}

function requestConfirm(title, copy, action) {
  $("#confirm-title").textContent = title;
  $("#confirm-copy").textContent = copy;
  confirmAction = action;
  $("#confirm-modal").hidden = false;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}

function buildReviewText(key) {
  const records = recordsFor(key);
  const completed = records.filter((record) => record.status === "completed");
  const player = playerById(state.selfId);
  const lines = [
    `旅途密令 · ${formatDate(key, { month: "numeric", day: "numeric" })}`,
    `${playerLabel(player.id)}：今日 ${scoreFor(key)} 分｜总分 ${currentTotalScore()}｜场均 ${(currentTotalScore() / Math.max(1, attendanceDays())).toFixed(1)}`,
  ];
  for (const record of completed) lines.push(`+${record.score}｜${record.taskId}｜目标 ${record.targetName}`);
  if (state.reviews[key]?.bonus) lines.push("+1｜最佳妙计");
  if (state.reviews[key]?.note) lines.push(`复盘：${state.reviews[key].note}`);
  return lines.join("\n");
}

async function shareReview() {
  const key = $("#review-date").value || dateKey();
  const text = buildReviewText(key);
  if (navigator.share) {
    try {
      await navigator.share({ title: "旅途密令每日复盘", text });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyText(text);
  showToast("复盘内容已复制，可粘贴到微信群");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `旅途密令-${state.selfId || "玩家"}-${dateKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (imported.version !== 1 || !Array.isArray(imported.roster) || !Array.isArray(imported.history)) throw new Error("invalid");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      state = loadState();
      showToast("记录已导入");
      renderAll();
    } catch {
      showToast("文件不是有效的旅途密令记录");
    }
  };
  reader.readAsText(file);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) navigate(nav.dataset.nav);
  const go = event.target.closest("[data-go]");
  if (go) navigate(go.dataset.go);

  const pick = event.target.closest("[data-player-pick]");
  if (pick) {
    onboardingSelection = pick.dataset.playerPick;
    renderOnboarding();
  }

  const close = event.target.closest("[data-close-modal]");
  if (close) closeModal(close.dataset.closeModal);
});

$("#draw-task").addEventListener("click", drawMission);
$("#reveal-task").addEventListener("click", revealMission);
$("#complete-task").addEventListener("click", openCompleteModal);
$("#abandon-task").addEventListener("click", () => {
  requestConfirm("放弃当前密令？", "本次抽取会计入今日次数，并记为 0 分。", () => resolveActiveTask("abandoned", null, "主动放弃"));
});

$("#confirm-complete").addEventListener("click", async () => {
  const witnessId = $("#witness-select").value;
  if (!witnessId) {
    showToast("请选择一名见证人");
    return;
  }
  const points = state.activeTask?.score || 0;
  const record = resolveActiveTask("completed", witnessId, $("#completion-note").value.trim());
  closeModal("complete-modal");
  if (record?.syncStatus === "pending") {
    await syncPendingRoomScores();
    showToast(record.syncStatus === "synced" ? `任务完成，${points} 分已同步` : `任务完成，${points} 分待联网同步`);
  } else {
    showToast(`任务完成，获得 ${points} 分`);
  }
});

$("#confirm-cancel").addEventListener("click", () => {
  confirmAction = null;
  closeModal("confirm-modal");
});

$("#confirm-ok").addEventListener("click", () => {
  const action = confirmAction;
  confirmAction = null;
  closeModal("confirm-modal");
  if (action) action();
});

$("#privacy-toggle").addEventListener("click", () => {
  state.settings.scoresHidden = !state.settings.scoresHidden;
  saveState();
  renderHeader();
  if (window.lucide) window.lucide.createIcons();
});

$("#room-status").addEventListener("click", () => {
  if (pendingInviteCode && !isInRoom()) $("#room-code-input").value = pendingInviteCode;
  renderRoomModal();
  $("#room-modal").hidden = false;
  if (window.lucide) window.lucide.createIcons();
});
$("#room-code-input").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
});
$("#create-room").addEventListener("click", () => enterRoom("create"));
$("#join-room").addEventListener("click", () => enterRoom("join"));
$("#copy-room-link").addEventListener("click", async () => {
  await copyText(window.tripRooms.inviteUrl());
  showToast("邀请链接已复制");
});
$("#leave-room").addEventListener("click", () => {
  requestConfirm("退出这个房间？", "只会清除本机连接，已同步的积分仍保留在房间中。", async () => {
    await window.tripRooms.leaveRoom();
    closeModal("room-modal");
    showToast("已退出本机房间");
  });
});

$("#review-alert").addEventListener("click", () => navigate("review"));
$("#review-date").addEventListener("change", () => {
  renderReview();
  if (isInRoom()) window.tripRooms.loadReviews($("#review-date").value).catch(() => {});
});
$("#attendance-toggle").addEventListener("change", async (event) => {
  const key = $("#review-date").value;
  state.attendance[key] = event.target.checked;
  saveState();
  renderRanking();
  if (isInRoom()) {
    try {
      await window.tripRooms.setAttendance(key, event.target.checked);
    } catch (error) {
      showToast(error?.message || "出勤同步失败");
    }
  }
});
$("#bonus-toggle").addEventListener("change", async (event) => {
  const key = $("#review-date").value;
  reviewFor(key).bonus = event.target.checked;
  saveState();
  renderScoreStrip();
  renderReview();
  renderRanking();
  if (isInRoom()) {
    try {
      await window.tripRooms.saveReview(key, reviewFor(key));
    } catch (error) {
      showToast(error?.message || "复盘同步失败");
    }
  }
});
$("#review-note").addEventListener("input", (event) => {
  reviewFor($("#review-date").value).note = event.target.value;
  saveState();
});
$("#share-review").addEventListener("click", shareReview);
$("#finish-review").addEventListener("click", async () => {
  const key = $("#review-date").value;
  reviewFor(key).reviewed = true;
  saveState();
  renderReview();
  renderReviewAlert();
  if (isInRoom()) {
    try {
      await window.tripRooms.saveReview(key, reviewFor(key));
    } catch (error) {
      showToast(error?.message || "复盘已保存本机，同步失败");
      return;
    }
  }
  showToast("今日复盘已完成");
});

$("#ranking-list").addEventListener("input", (event) => {
  const input = event.target.closest("[data-rank-field]");
  if (!input) return;
  const row = input.closest("[data-player-id]");
  const id = row.dataset.playerId;
  state.leaderboard[id] ||= { total: 0, days: 0 };
  state.leaderboard[id][input.dataset.rankField] = Math.max(0, Number(input.value) || 0);
  saveState();
  const entry = state.leaderboard[id];
  row.querySelector(".rank-average").textContent = (entry.total / Math.max(1, entry.days)).toFixed(1);
});

$("#ranking-list").addEventListener("change", (event) => {
  const input = event.target.closest("[data-rank-field]");
  if (!input) return;
  renderRanking();
});

$("#reset-ranking").addEventListener("click", () => {
  requestConfirm("清空他人录分？", "只清空本机手动录入的其他玩家总分，不影响自己的任务记录。", () => {
    state.leaderboard = Object.fromEntries(PLAYER_IDS.map((id) => [id, id === state.selfId ? { total: totalScore(), days: attendanceDays() } : { total: 0, days: 0 }]));
    saveState();
    renderRanking();
  });
});

$("#self-player").addEventListener("change", (event) => {
  if (isInRoom()) return;
  state.selfId = event.target.value;
  playerById(state.selfId).active = true;
  state.attendance[dateKey()] = true;
  saveState();
  renderAll();
});
$("#self-name").addEventListener("change", async (event) => {
  if (!state.selfId) return;
  playerById(state.selfId).name = event.target.value.trim() || `玩家${state.selfId}`;
  saveState();
  renderAll();
  if (isInRoom()) {
    try {
      await window.tripRooms.updateName(playerById(state.selfId).name);
    } catch (error) {
      showToast(error?.message || "名字同步失败");
    }
  }
});
$("#review-time").addEventListener("change", (event) => {
  state.settings.reviewTime = event.target.value || "21:30";
  saveState();
  renderReviewAlert();
});
$("#daily-limit-control").addEventListener("click", (event) => {
  const button = event.target.closest("[data-limit]");
  if (!button) return;
  state.settings.dailyLimit = Number(button.dataset.limit);
  saveState();
  renderAll();
});
$("#roster-grid").addEventListener("change", (event) => {
  if (isInRoom()) return;
  const item = event.target.closest("[data-roster-id]");
  if (!item) return;
  const player = playerById(item.dataset.rosterId);
  if (event.target.classList.contains("roster-active")) player.active = event.target.checked;
  if (event.target.classList.contains("roster-name-input")) player.name = event.target.value.trim() || `玩家${player.id}`;
  saveState();
  renderAll();
});

$("#start-app").addEventListener("click", () => {
  state.selfId = onboardingSelection;
  const name = $("#onboarding-name").value.trim();
  if (name) playerById(state.selfId).name = name;
  playerById(state.selfId).active = true;
  state.attendance[dateKey()] = true;
  saveState();
  renderAll();
  if (pendingInviteCode && !isInRoom()) {
    $("#room-code-input").value = pendingInviteCode;
    $("#room-player-name").value = playerById(state.selfId).name;
    $("#room-modal").hidden = false;
  }
});

$("#export-data").addEventListener("click", exportData);
$("#import-data").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", (event) => {
  if (event.target.files?.[0]) importData(event.target.files[0]);
  event.target.value = "";
});
$("#reset-data").addEventListener("click", () => {
  requestConfirm("清空本机全部数据？", "任务记录、积分、复盘和总榜都会被删除，且无法恢复。", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = createDefaultState();
    onboardingSelection = "A";
    renderAll();
  });
});

setInterval(() => {
  if (state.activeTask && Date.now() >= state.activeTask.expiresAt) {
    expireTaskIfNeeded();
    showToast("当前密令已超时，本次计 0 分");
    renderAll();
  } else {
    updateTaskTimer();
  }
  renderReviewAlert();
}, 30000);

window.tripRooms?.onChange((nextSnapshot) => {
  applyRoomSnapshot(nextSnapshot);
  renderAll();
  syncPendingRoomScores();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

renderAll();
window.tripRooms?.init().then((nextSnapshot) => {
  applyRoomSnapshot(nextSnapshot);
  renderAll();
  if (nextSnapshot.session) {
    window.tripRooms.loadReviews(dateKey()).catch(() => {});
    syncPendingRoomScores();
  } else if (pendingInviteCode && state.selfId) {
    $("#room-code-input").value = pendingInviteCode;
    $("#room-modal").hidden = false;
  }
});
