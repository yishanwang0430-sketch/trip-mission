(() => {
  const canvas = document.querySelector("#game-canvas");
  const callbacks = { start: [], move: [], end: [], show: [], share: [] };
  const params = new URLSearchParams(location.search);
  const demoMode = params.get("demo") || "home";
  const playerNames = ["一山", "阿禾", "小满", "青川", "南星", "木木", "可乐", "石榴", "松风", "朝露", "云舟", "听雨"];
  const demoCount = Math.max(3, Math.min(12, Number(params.get("count")) || 8));
  const hiddenEditorDemo = demoMode === "hidden-editor";
  const hiddenTaskDemo = demoMode === "hidden-task";
  const bountyEditorDemo = demoMode === "bounty-editor";
  const rewardDemo = demoMode === "reward";
  const roundNumber = bountyEditorDemo ? 2 : rewardDemo ? 5 : demoMode === "review" ? 1 : 1;
  const room = {
    roomId: "11111111-1111-4111-8111-111111111111",
    roomCode: "618205",
    maxPlayers: demoCount,
    status: demoMode === "review" ? "review" : demoMode === "ended" ? "ended" : ["lobby", "hidden-editor", "bounty-editor"].includes(demoMode) ? "lobby" : "playing",
    ownerPlayerId: "player-1",
    currentReviewOn: demoMode === "review" ? "2026-07-28" : null,
    roundNumber,
    roundStartedAt: ["lobby", "hidden-editor", "bounty-editor"].includes(demoMode) ? null : new Date(Date.now() - 12 * 60000).toISOString(),
    roundDeadline: ["lobby", "hidden-editor", "bounty-editor", "review", "ended"].includes(demoMode) ? null : new Date(Date.now() + 108 * 60000).toISOString(),
    roundDoneCount: demoMode === "task" ? 3 : 0,
    canAdvanceRound: demoMode === "task",
    self: { id: "player-1", seat: 1, name: "一山", isOwner: true },
    players: playerNames.slice(0, demoMode === "lobby" ? Math.min(5, demoCount) : demoCount).map((name, index) => ({
      id: `player-${index + 1}`,
      seat: index + 1,
      name,
      totalScore: [8, 6, 11, 5, 9, 3, 7, 4, 10, 2, 5, 1][index],
      roundScore: [3, 1, 5, 0, 2, 0, 1, 0, 4, 0, 0, 0][index],
      roundDone: index < 3,
      present: index !== 6,
      online: index < 5 || index === 7,
    })),
    pendingApprovals: demoMode === "playing" ? [{
      id: "claim-1", playerId: "player-3", playerName: "小满", playerSeat: 3,
      taskCode: "M03-7KF", points: 2, targetName: "5号 · 南星", playedOn: "2026-07-28",
    }] : [],
    myClaims: [],
    reviews: demoMode === "review" ? [
      { playerId: "player-2", playerName: "阿禾", playerSeat: 2, note: "最好笑的一次", isWinner: false },
      { playerId: "player-3", playerName: "小满", playerSeat: 3, note: "最默契的一次", isWinner: false },
    ] : [],
    hiddenTask: hiddenEditorDemo
      ? { status: "editing", isEditor: true, needsSubmission: true, availableForSelf: false, taskUid: null }
      : hiddenTaskDemo
        ? { status: "claimed", isEditor: false, needsSubmission: false, availableForSelf: true, taskUid: "hidden-demo-1" }
        : { status: demoMode === "lobby" ? "unassigned" : "claimed", isEditor: false, needsSubmission: false, availableForSelf: false, taskUid: null },
    bountyTask: bountyEditorDemo
      ? { status: "editing", isEditor: true, needsSubmission: true, availableToClaim: false }
      : ["task", "reward"].includes(demoMode)
        ? {
          status: "ready", isEditor: false, needsSubmission: false, availableToClaim: true,
          taskUid: "bounty-demo-1", taskCode: "B01-5PT",
          description: "率先让三位同行一起说出“出发”。",
          editorPlayerId: "player-3", claimantPlayerId: null, claimantName: null,
        }
        : { status: "none", isEditor: false, needsSubmission: false, availableToClaim: false },
    cycleReward: rewardDemo
      ? { cycleNumber: 1, status: "pending", winnerPlayerId: "player-1", winnerName: "一山", isWinner: true, category: null, resultText: null }
      : { status: "none" },
  };

  if (demoMode !== "home") {
    const demoBatchId = `batch-${roundNumber}-demo`;
    const taskDemo = demoMode === "task" || rewardDemo;
    const activeTasks = taskDemo ? [
      {
        uid: "active-1", taskId: "M03", code: "M03-8QJ", score: 2,
        targetId: "player-4", targetName: "4号 · 青川", randomWords: ["真的"],
        description: "让4号 · 青川先向你推荐一道菜、歌或景点，随后自然说出“真的”。",
        drawnAt: Date.now() - 600000, expiresAt: Date.now() + 6600000,
        playedOn: "2026-07-30", revealed: true, batchId: demoBatchId, batchOrder: 1, roundNumber,
      },
      {
        uid: "active-2", taskId: "L12", code: "L12-4AX", score: 1,
        targetId: "player-2", targetName: "2号 · 阿禾", randomWords: [],
        description: "让2号 · 阿禾把3号 · 小满叫到你们当前所在的安全位置。",
        drawnAt: Date.now() - 600000, expiresAt: Date.now() + 6600000,
        playedOn: "2026-07-30", revealed: true, batchId: demoBatchId, batchOrder: 2, roundNumber,
      },
    ] : hiddenTaskDemo ? [{
      uid: "hidden-demo-1", taskId: "X01", code: "X01-7MX", score: 3,
      targetId: null, targetName: "本轮隐藏任务", randomWords: [], isHidden: true,
      description: "让任意一位同行主动发起一次安全的三人合照，并完成拍摄。",
      drawnAt: Date.now() - 300000, expiresAt: Date.now() + 6900000,
      playedOn: "2026-07-30", revealed: true, batchId: demoBatchId, batchOrder: 1, roundNumber,
    }] : [];
    const batchHistory = taskDemo ? [{
      uid: "active-3", taskId: "H03", code: "H03-1DP", score: 3,
      targetName: "3号 · 小满", randomWords: [], description: "让3号 · 小满主动发起并完成一项至少 3 人参与的小活动。",
      drawnAt: Date.now() - 600000, expiresAt: Date.now() + 6600000,
      playedOn: "2026-07-30", revealed: true, batchId: demoBatchId, batchOrder: 3, roundNumber,
      status: "approved", resolvedAt: Date.now() - 60000,
    }] : [];
    localStorage.setItem("travel-secret-minigame-v1", JSON.stringify({
      version: 2,
      profileName: "一山",
      session: { roomCode: room.roomCode, playerId: room.self.id, seat: 1, name: "一山" },
      desiredCapacity: 8,
      activeTasks,
      currentBatchId: activeTasks.length || batchHistory.length ? demoBatchId : null,
      currentRound: roundNumber,
      completedRounds: [],
      history: [
        { uid: "history-1", code: "L04-3CA", taskId: "L04", score: 1, targetName: "2号 · 阿禾", playedOn: "2026-07-28", status: "approved" },
        ...batchHistory,
        ...(taskDemo ? [] : [{ uid: "history-2", code: "H03-1DP", taskId: "H03", score: 3, targetName: "4号 · 青川", playedOn: "2026-07-28", status: "pending" }]),
      ],
      reviewDrafts: {},
    }));
  } else {
    localStorage.removeItem("travel-secret-minigame-v1");
  }

  function touchEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event.changedTouches?.[0] || event;
    return { clientX: source.clientX - rect.left, clientY: source.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (event) => callbacks.start.forEach((fn) => fn({ touches: [touchEvent(event)] })));
  canvas.addEventListener("pointermove", (event) => { if (event.buttons) callbacks.move.forEach((fn) => fn({ touches: [touchEvent(event)] })); });
  canvas.addEventListener("pointerup", (event) => callbacks.end.forEach((fn) => fn({ changedTouches: [touchEvent(event)] })));

  function rpcName(url) { return url.split("/").pop(); }
  function respond(options, data) { setTimeout(() => options.success?.({ statusCode: 200, data: JSON.parse(JSON.stringify(data)) }), 80); }

  window.wx = {
    createCanvas: () => canvas,
    createImage: () => {
      const image = new Image();
      const descriptor = Object.getOwnPropertyDescriptor(Image.prototype, "src");
      Object.defineProperty(image, "src", {
        set(value) { descriptor.set.call(image, value.startsWith("assets/") ? `../${value}` : value); },
        get() { return descriptor.get.call(image); },
      });
      return image;
    },
    getWindowInfo: () => ({ windowWidth: Math.min(innerWidth, 430), windowHeight: innerHeight, pixelRatio: devicePixelRatio || 1, safeArea: { top: 8, bottom: innerHeight - 8 } }),
    getStorageSync: (key) => localStorage.getItem(key) || "",
    setStorageSync: (key, value) => localStorage.setItem(key, value),
    getLaunchOptionsSync: () => ({ query: Object.fromEntries(params.entries()) }),
    onTouchStart: (fn) => callbacks.start.push(fn),
    onTouchMove: (fn) => callbacks.move.push(fn),
    onTouchEnd: (fn) => callbacks.end.push(fn),
    onShow: (fn) => callbacks.show.push(fn),
    onShareAppMessage: (fn) => callbacks.share.push(fn),
    showShareMenu() {},
    shareAppMessage(payload) { alert(`${payload.title}\n房间号：${room.roomCode}`); },
    vibrateShort() {},
    request(options) {
      const name = rpcName(options.url);
      if (name === "create_secret_room" || name === "join_secret_room") {
        room.self.name = options.data.p_name;
        room.players[0].name = options.data.p_name;
        respond(options, room);
      }
      else if (name === "get_secret_room") respond(options, room);
      else if (name === "start_secret_room") {
        room.status = "lobby";
        room.hiddenTask = { status: "editing", isEditor: true, needsSubmission: true, availableForSelf: false, taskUid: null };
        respond(options, room);
      }
      else if (name === "submit_secret_hidden_task") {
        room.status = "playing";
        room.roundStartedAt = new Date().toISOString();
        room.roundDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        room.hiddenTask = { status: "ready", isEditor: true, needsSubmission: false, availableForSelf: false, taskUid: null };
        respond(options, room);
      }
      else if (name === "take_secret_hidden_task") {
        room.hiddenTask.status = "claimed";
        respond(options, {
          task: {
            uid: "hidden-demo-1", taskId: "X01", code: "X01-7MX", score: 3,
            targetName: "本轮隐藏任务", isHidden: true,
            description: "让任意一位同行主动发起一次安全的三人合照，并完成拍摄。",
          },
          room,
        });
      }
      else if (name === "submit_secret_bounty_task") {
        room.status = "playing";
        room.roundStartedAt = new Date().toISOString();
        room.roundDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        room.bountyTask = {
          status: "ready", isEditor: true, needsSubmission: false, availableToClaim: true,
          taskUid: "bounty-demo-1", taskCode: "B01-5PT", description: options.data.p_description,
          editorPlayerId: room.self.id, claimantPlayerId: null, claimantName: null,
        };
        respond(options, room);
      }
      else if (name === "claim_secret_bounty") {
        room.bountyTask.status = "pending";
        room.bountyTask.availableToClaim = false;
        room.bountyTask.claimantPlayerId = room.self.id;
        room.bountyTask.claimantName = room.self.name;
        room.myClaims.push({ taskUid: room.bountyTask.taskUid, status: "pending", claimKind: "bounty", points: 5 });
        respond(options, room);
      }
      else if (name === "complete_secret_round") {
        room.players[0].roundDone = true;
        room.roundDoneCount = Math.min(room.players.length, room.roundDoneCount + 1);
        room.canAdvanceRound = room.roundDoneCount >= room.players.filter((player) => player.present !== false).length;
        respond(options, room);
      }
      else if (name === "start_secret_next_round") {
        room.roundNumber += 1;
        room.status = "lobby";
        room.currentReviewOn = null;
        room.roundStartedAt = null;
        room.roundDeadline = null;
        room.roundDoneCount = 0;
        room.canAdvanceRound = false;
        room.bountyTask = { status: "editing", isEditor: true, needsSubmission: true, availableToClaim: false };
        respond(options, room);
      }
      else if (name === "choose_secret_cycle_reward") {
        room.cycleReward.status = "revealed";
        room.cycleReward.category = options.data.p_category;
        room.cycleReward.resultText = options.data.p_category === "prank" ? "用播音腔介绍下一站" : "获得团队摄影师称号";
        respond(options, room);
      }
      else if (name === "set_secret_presence") { room.players[0].present = options.data.p_present; respond(options, room); }
      else if (name === "update_secret_name") { room.self.name = options.data.p_name; room.players[0].name = options.data.p_name; respond(options, room); }
      else if (name === "set_secret_room_status") { room.status = options.data.p_status; room.currentReviewOn = options.data.p_reviewed_on || room.currentReviewOn; respond(options, room); }
      else if (name === "claim_secret_score") { room.myClaims.push({ taskUid: options.data.p_task_uid, status: "pending" }); respond(options, room); }
      else if (name === "resolve_secret_score") { room.pendingApprovals = room.pendingApprovals.filter((item) => item.id !== options.data.p_claim_id); respond(options, room); }
      else if (name === "save_secret_review") { room.reviews.push({ playerId: room.self.id, playerName: room.self.name, playerSeat: room.self.seat, note: options.data.p_note, isWinner: false }); respond(options, room); }
      else if (name === "award_secret_review") { room.reviews.forEach((item) => { item.isWinner = item.playerId === options.data.p_player_id; }); respond(options, room); }
      else if (name === "delete_secret_room") respond(options, true);
      else options.fail?.({ message: "Unknown preview RPC" });
    },
    showModal(options) {
      if (options.editable) {
        const value = prompt(options.title, options.content || "");
        options.success?.({ confirm: value !== null, cancel: value === null, content: value || "" });
      } else {
        const accepted = options.showCancel === false ? (alert(`${options.title}\n\n${options.content}`), true) : confirm(`${options.title}\n\n${options.content}`);
        options.success?.({ confirm: accepted, cancel: !accepted });
      }
    },
    showActionSheet(options) {
      const value = prompt(options.itemList.map((item, index) => `${index + 1}. ${item}`).join("\n"), "1");
      const tapIndex = Number(value) - 1;
      if (tapIndex >= 0 && tapIndex < options.itemList.length) options.success?.({ tapIndex });
    },
    setClipboardData({ data }) { navigator.clipboard?.writeText(data); },
    cloud: {
      init() {},
      callFunction() { return Promise.resolve({ result: { ok: true, suggest: "pass", label: 100 } }); },
    },
  };
})();
