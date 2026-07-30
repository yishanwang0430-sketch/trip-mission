const LOCAL_BLOCKLIST = /(习近平|共产党|六四|色情|成人视频|裸聊|性交易|强奸|乱伦|赌博|博彩|下注|毒品|冰毒|海洛因|枪支|炸弹|恐怖主义|自杀|杀人|砍人|诈骗|洗钱|代开发票|辱骂|歧视|纳粹|邪教|加微信|联系方式|手机号|身份证|银行卡|密码|转账|付款|偷拍|陌生人)/i;

function localTextAllowed(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/[\u0000-\u001f\u007f]/.test(text) && !LOCAL_BLOCKLIST.test(text);
}

async function checkText(value, scene = 2) {
  const content = String(value || "").trim();
  if (!localTextAllowed(content)) throw new Error("内容包含不适合公开展示的信息，请修改后重试");
  if (!wx.cloud?.callFunction) throw new Error("内容安全服务暂不可用，请稍后重试");

  let response;
  try {
    response = await wx.cloud.callFunction({
      name: "contentSecurity",
      data: { content, scene },
    });
  } catch (_) {
    throw new Error("内容安全检查失败，请检查网络后重试");
  }

  const result = response?.result || {};
  if (!result.ok || result.suggest !== "pass") {
    throw new Error("内容未通过平台安全检查，请修改后重试");
  }
  return true;
}

module.exports = { LOCAL_BLOCKLIST, checkText, localTextAllowed };
