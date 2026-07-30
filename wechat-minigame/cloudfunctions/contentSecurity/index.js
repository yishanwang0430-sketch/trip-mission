const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const content = String(event?.content || "").trim().slice(0, 500);
  const scene = Number(event?.scene) || 2;
  if (!content) return { ok: false, suggest: "risky", label: 100 };

  try {
    const context = cloud.getWXContext();
    const response = await cloud.openapi.security.msgSecCheck({
      content,
      version: 2,
      scene,
      openid: context.OPENID,
    });
    const detail = response?.result || response;
    return {
      ok: detail?.suggest === "pass",
      suggest: detail?.suggest || "risky",
      label: detail?.label || 100,
    };
  } catch (error) {
    console.error("msgSecCheck failed", error);
    return { ok: false, suggest: "risky", label: 100 };
  }
};
