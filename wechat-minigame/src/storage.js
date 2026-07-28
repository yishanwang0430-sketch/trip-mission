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
