(() => {
  const canvas = document.querySelector("#game-canvas");
  const callbacks = { start: [], move: [], end: [], show: [], share: [] };
  const params = new URLSearchParams(location.search);
  const demoMode = params.get("demo") || "home";
  const playerNames = ["一山", "阿禾", "小满", "青川", "南星", "木木", "可乐", "石榴", "松风", "朝露", "云舟", "听雨"];
  const demoCount = Math.max(3, Math.min(12, Number(params.get("count")) || 8));
  const room = {
    roomId: "11111111-1111-4111-8111-111111111111",
    roomCode: "618205",
    maxPlayers: demoCount,
    status: demoMode === "review" ? "review" : demoMode === "ended" ? "ended" : demoMode === "lobby" ? "lobby" : "playing",
    ownerPlayerId: "player-1",
    currentReviewOn: demoMode === "review" ? "2026-07-28" : null,
    self: { id: "player-1", seat: 1, name: "一山", isOwner: true },
    players: playerNames.slice(0, demoMode === "lobby" ? Math.min(5, demoCount) : demoCount).map((name, index) => ({
      id: `player-${index + 1}`,
      seat: index + 1,
      name,
      totalScore: [8, 6, 11, 5, 9, 3, 7, 4, 10, 2, 5, 1][index],
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
  };

  if (demoMode !== "home") {
    localStorage.setItem("travel-secret-minigame-v1", JSON.stringify({
      version: 1,
      profileName: "一山",
      session: { roomCode: room.roomCode, playerId: room.self.id, seat: 1, name: "一山" },
      desiredCapacity: 8,
      activeTask: demoMode === "task" ? {
        uid: "active-1", taskId: "M04", code: "M04-8QJ", score: 2,
        targetId: "player-4", targetName: "4号 · 青川",
        description: "让4号 · 青川先说出你的名字，再问你一个包含“为什么”的问题。",
        drawnAt: Date.now() - 600000, expiresAt: Date.now() + 6600000,
        playedOn: "2026-07-28", revealed: true,
      } : null,
      history: [
        { uid: "history-1", code: "L04-3CA", taskId: "L04", score: 1, targetName: "2号 · 阿禾", playedOn: "2026-07-28", status: "approved" },
        ...(demoMode === "task" ? [] : [{ uid: "history-2", code: "H03-1DP", taskId: "H03", score: 3, targetName: "4号 · 青川", playedOn: "2026-07-28", status: "pending" }]),
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
      if (name === "create_secret_room" || name === "join_secret_room" || name === "get_secret_room") respond(options, room);
      else if (name === "start_secret_room") { room.status = "playing"; respond(options, room); }
      else if (name === "set_secret_presence") { room.players[0].present = options.data.p_present; respond(options, room); }
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
  };
})();
