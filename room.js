(() => {
  const SESSION_KEY = "travel-secret-room-v1";
  const DEVICE_KEY = "travel-secret-device-v1";
  const config = window.TRIP_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(config.url || "") && String(config.anonKey || "").length > 40;
  const listeners = new Set();
  let reviewsByDate = {};
  let client = null;
  let channel = null;
  let refreshTimer = null;
  let session = loadJson(SESSION_KEY);
  let players = [];
  let onlinePlayerIds = new Set();
  let status = configured ? "idle" : "unavailable";
  let lastError = "";

  function loadJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || null;
    } catch {
      return null;
    }
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  }

  function deviceToken() {
    let token = localStorage.getItem(DEVICE_KEY);
    if (!token) {
      token = crypto.randomUUID?.() || `${Date.now().toString(16)}-0000-4000-8000-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(12, "0").slice(-12)}`;
      localStorage.setItem(DEVICE_KEY, token);
    }
    return token;
  }

  function snapshot() {
    return {
      available: configured,
      connected: status === "connected" && Boolean(session),
      status,
      error: lastError,
      session: session ? { ...session } : null,
      players: players.map((player) => ({ ...player })),
      onlinePlayerIds: [...onlinePlayerIds],
      reviewsByDate: { ...reviewsByDate },
    };
  }

  function notify() {
    const value = snapshot();
    for (const listener of listeners) listener(value);
    window.dispatchEvent(new CustomEvent("trip-room-change", { detail: value }));
  }

  function setStatus(nextStatus, error = "") {
    status = nextStatus;
    lastError = error;
    notify();
  }

  function friendlyError(error) {
    const message = String(error?.message || error || "");
    if (message.includes("ROOM_NOT_FOUND")) return "没有找到这个房间";
    if (message.includes("ROOM_FULL")) return "房间已经满员";
    if (message.includes("INVALID_MEMBER")) return "本机房间凭证已失效，请重新加入";
    if (message.includes("INVALID_WITNESS")) return "见证人当前不在这个房间";
    if (message.includes("Failed to fetch")) return "暂时无法连接联机服务";
    return message || "联机操作失败";
  }

  async function call(name, params) {
    if (!client) throw new Error("联机服务尚未配置");
    const { data, error } = await client.rpc(name, params);
    if (error) throw new Error(friendlyError(error));
    return data;
  }

  function normalizeRoomData(data) {
    const value = typeof data === "string" ? JSON.parse(data) : data;
    if (!value?.roomCode || !value?.self) throw new Error("房间返回数据无效");
    return value;
  }

  async function refreshPlayers({ quiet = false } = {}) {
    if (!session || !client) return;
    try {
      const data = normalizeRoomData(await call("get_trip_room", {
        p_room_code: session.roomCode,
        p_device_token: deviceToken(),
      }));
      players = data.players || [];
      saveSession({
        roomId: data.roomId,
        roomCode: data.roomCode,
        playerId: data.self.id,
        seat: data.self.seat,
        name: data.self.name,
      });
      if (!quiet) setStatus(channel ? "connected" : "connecting");
      else notify();
    } catch (error) {
      if (!quiet) setStatus("error", friendlyError(error));
      throw error;
    }
  }

  function updatePresence() {
    const next = new Set();
    const presence = channel?.presenceState?.() || {};
    for (const entries of Object.values(presence)) {
      for (const entry of entries) {
        if (entry.playerId) next.add(entry.playerId);
      }
    }
    onlinePlayerIds = next;
    notify();
  }

  async function stopRealtime() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    if (channel && client) await client.removeChannel(channel);
    channel = null;
    onlinePlayerIds = new Set();
  }

  async function startRealtime() {
    if (!session || !client) return;
    await stopRealtime();
    channel = client.channel(`trip-room:${session.roomCode}`, {
      config: { presence: { key: session.playerId } },
    });
    channel
      .on("presence", { event: "sync" }, updatePresence)
      .on("presence", { event: "join" }, updatePresence)
      .on("presence", { event: "leave" }, updatePresence)
      .on("broadcast", { event: "refresh" }, async ({ payload }) => {
        await refreshPlayers({ quiet: true }).catch(() => {});
        if (payload?.date) await loadReviews(payload.date).catch(() => {});
      })
      .subscribe(async (nextStatus) => {
        if (nextStatus === "SUBSCRIBED") {
          await channel.track({
            playerId: session.playerId,
            seat: session.seat,
            name: session.name,
            onlineAt: new Date().toISOString(),
          });
          updatePresence();
          setStatus("connected");
          await broadcastRefresh();
        } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(nextStatus)) {
          setStatus("error", "实时连接中断，正在重试");
        }
      });
    refreshTimer = setInterval(() => refreshPlayers({ quiet: true }).catch(() => {}), 30000);
  }

  async function attachRoom(data) {
    const room = normalizeRoomData(data);
    players = room.players || [];
    saveSession({
      roomId: room.roomId,
      roomCode: room.roomCode,
      playerId: room.self.id,
      seat: room.self.seat,
      name: room.self.name,
    });
    setStatus("connecting");
    await startRealtime();
    return snapshot();
  }

  async function init() {
    if (!configured) {
      setStatus("unavailable");
      return snapshot();
    }
    if (!window.supabase?.createClient) {
      setStatus("error", "联机组件加载失败");
      return snapshot();
    }
    client = window.supabase.createClient(config.url.replace(/\/$/, ""), config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
    if (!session) {
      setStatus("idle");
      return snapshot();
    }
    setStatus("connecting");
    try {
      await refreshPlayers({ quiet: true });
      await startRealtime();
    } catch (error) {
      setStatus("error", friendlyError(error));
    }
    return snapshot();
  }

  async function createRoom(name) {
    setStatus("connecting");
    try {
      const data = await call("create_trip_room", {
        p_name: String(name || "").trim().slice(0, 12) || "玩家A",
        p_device_token: deviceToken(),
      });
      return await attachRoom(data);
    } catch (error) {
      setStatus("idle", friendlyError(error));
      throw error;
    }
  }

  async function joinRoom(code, name) {
    const normalizedCode = String(code || "").replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) throw new Error("请输入 6 位房间号");
    setStatus("connecting");
    try {
      const data = await call("join_trip_room", {
        p_room_code: normalizedCode,
        p_name: String(name || "").trim().slice(0, 12) || "同行玩家",
        p_device_token: deviceToken(),
      });
      return await attachRoom(data);
    } catch (error) {
      setStatus("idle", friendlyError(error));
      throw error;
    }
  }

  async function leaveRoom() {
    await stopRealtime();
    saveSession(null);
    players = [];
    reviewsByDate = {};
    setStatus(configured ? "idle" : "unavailable");
  }

  async function broadcastRefresh(date = null) {
    if (!channel || channel.state !== "joined") return;
    await channel.send({ type: "broadcast", event: "refresh", payload: { date } });
  }

  async function recordTask(record, witnessSeat) {
    if (!session) throw new Error("尚未加入房间");
    const witness = players.find((player) => player.seat === witnessSeat);
    if (!witness) throw new Error("见证人当前不在这个房间");
    await call("record_trip_score", {
      p_room_code: session.roomCode,
      p_device_token: deviceToken(),
      p_task_uid: record.uid,
      p_task_code: record.code,
      p_task_id: record.taskId,
      p_points: record.score,
      p_target_name: record.targetName,
      p_witness_id: witness.id,
      p_note: record.note || "",
      p_played_on: record.dateKey,
    });
    await refreshPlayers({ quiet: true });
    await broadcastRefresh();
  }

  async function setAttendance(key, present) {
    if (!session) return;
    await call("set_trip_attendance", {
      p_room_code: session.roomCode,
      p_device_token: deviceToken(),
      p_played_on: key,
      p_present: Boolean(present),
    });
    await refreshPlayers({ quiet: true });
    await broadcastRefresh(key);
  }

  async function saveReview(key, review) {
    if (!session) return;
    await call("save_trip_review", {
      p_room_code: session.roomCode,
      p_device_token: deviceToken(),
      p_reviewed_on: key,
      p_bonus: Boolean(review.bonus),
      p_note: String(review.note || "").slice(0, 120),
      p_reviewed: Boolean(review.reviewed),
    });
    await refreshPlayers({ quiet: true });
    await loadReviews(key);
    await broadcastRefresh(key);
  }

  async function loadReviews(key) {
    if (!session) return [];
    const data = await call("get_trip_reviews", {
      p_room_code: session.roomCode,
      p_device_token: deviceToken(),
      p_reviewed_on: key,
    });
    reviewsByDate[key] = Array.isArray(data) ? data : [];
    notify();
    return reviewsByDate[key];
  }

  async function updateName(name) {
    if (!session) return;
    const cleanName = String(name || "").trim().slice(0, 12);
    if (!cleanName) return;
    await call("update_trip_name", {
      p_room_code: session.roomCode,
      p_device_token: deviceToken(),
      p_name: cleanName,
    });
    session.name = cleanName;
    saveSession(session);
    await refreshPlayers({ quiet: true });
    await channel?.track({ playerId: session.playerId, seat: session.seat, name: cleanName, onlineAt: new Date().toISOString() });
    await broadcastRefresh();
  }

  function inviteUrl() {
    if (!session) return location.href;
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", session.roomCode);
    return url.toString();
  }

  window.tripRooms = {
    init,
    snapshot,
    createRoom,
    joinRoom,
    leaveRoom,
    recordTask,
    setAttendance,
    saveReview,
    loadReviews,
    updateName,
    refresh: refreshPlayers,
    inviteUrl,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  window.addEventListener("online", () => {
    if (session && client) refreshPlayers().then(startRealtime).catch(() => {});
  });
})();
