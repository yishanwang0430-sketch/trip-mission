const WORDS = [
  "随便", "等一下", "我看看", "真的", "可以", "确定", "不知道", "没问题",
  "好像", "原来", "马上", "应该", "可能", "当然", "没关系", "再看看",
  "差不多", "有道理", "然后呢", "你觉得", "怎么办", "太好了", "慢一点", "走吧",
];

const TASKS = [
  { id: "L01", score: 1, minPlayers: 2, wordCount: 1, build: ({ target, word }) => `让${target}在自然对话中说出“${word}”。` },
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
  { id: "L13", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动问接下来的行程安排。` },
  { id: "L14", score: 1, minPlayers: 2, build: ({ target }) => `让${target}自然提醒大家慢一点。` },
  { id: "L15", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动查看菜单或价目表上的一个价格。` },
  { id: "L16", score: 1, minPlayers: 2, build: ({ target }) => `给出两个无害选项，让${target}明确选择其中一个。` },
  { id: "L17", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动提议找一个合适的位置休息片刻。` },
  { id: "L18", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动问你的手机还剩多少电。` },
  { id: "L19", score: 1, minPlayers: 2, build: ({ target }) => `让${target}自然评价一次今天的天气。` },
  { id: "L20", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动问你刚才有没有拍照。` },
  { id: "L21", score: 1, minPlayers: 2, build: ({ target }) => `让${target}帮你拿一件轻便且允许的随身物品，并立即归还。` },
  { id: "L22", score: 1, minPlayers: 2, build: ({ target }) => `让${target}说出眼前最显眼的一种颜色。` },
  { id: "L23", score: 1, minPlayers: 2, build: ({ target }) => `让${target}自然说出今天是星期几。` },
  { id: "L24", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动问同行是否需要休息或补水。` },
  { id: "L25", score: 1, minPlayers: 3, build: ({ target }) => `让${target}主动数一下当前在场的同行人数。` },
  { id: "L26", score: 1, minPlayers: 2, build: ({ target }) => `让${target}问一句“我们几点出发”。` },
  { id: "L27", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动选择一个合适的座位或站位。` },
  { id: "L28", score: 1, minPlayers: 2, build: ({ target }) => `让${target}在对话中自然提到导航或地图。` },
  { id: "L29", score: 1, minPlayers: 2, build: ({ target }) => `让${target}说出一种适合作为纪念品的东西。` },
  { id: "L30", score: 1, minPlayers: 2, build: ({ target }) => `让${target}比较两种当地食物并说出更想尝试哪种。` },
  { id: "L31", score: 1, minPlayers: 2, wordCount: 1, build: ({ target, word }) => `让${target}先叫出你的名字，再自然说出“${word}”。` },
  { id: "L32", score: 1, minPlayers: 3, build: ({ target, other }) => `让${target}主动问${other}今天拍了多少张照片。` },
  { id: "L33", score: 1, minPlayers: 2, build: ({ target }) => `让${target}自然哼出一小段大家熟悉的旋律。` },
  { id: "L34", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动指出一个有趣的招牌或提示牌。` },
  { id: "L35", score: 1, minPlayers: 2, build: ({ target }) => `让${target}在回应你时自然做出一次点赞手势。` },
  { id: "L36", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动问一句“还有多久”。` },
  { id: "L37", score: 1, minPlayers: 2, build: ({ target }) => `让${target}说出当前地点一个值得夸奖的细节。` },
  { id: "L38", score: 1, minPlayers: 2, build: ({ target }) => `让${target}主动确认下一段路线往哪个方向走。` },
  { id: "L39", score: 1, minPlayers: 2, build: ({ target }) => `让${target}提出一条不改变既定安全安排的小建议。` },
  { id: "L40", score: 1, minPlayers: 2, build: ({ target }) => `让${target}在集体讨论中自然说出“我同意”。` },
  { id: "M01", score: 2, minPlayers: 2, wordCount: 1, build: ({ target, word }) => `10 分钟内，让${target}先说“${word}”，再递给你一件允许的小物品。` },
  { id: "M02", score: 2, minPlayers: 2, build: ({ target }) => `让${target}先纠正一个无关紧要的错误，再继续追问一个相关问题。` },
  { id: "M03", score: 2, minPlayers: 2, wordCount: 1, build: ({ target, word }) => `让${target}先向你推荐一道菜、歌或景点，随后自然说出“${word}”。` },
  { id: "M04", score: 2, minPlayers: 2, build: ({ target }) => `让${target}先说出你的名字，再问你一个包含“为什么”的问题。` },
  { id: "M05", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}在 10 分钟内向你和${other}询问同一件无害的小事。` },
  { id: "M06", score: 2, minPlayers: 2, build: ({ target }) => `让${target}自然模仿一个安全小动作，随后问你一个问题。` },
  { id: "M07", score: 2, minPlayers: 3, build: ({ target }) => `让${target}提出一项小型集体活动，并让至少另一人同意参加。` },
  { id: "M08", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}主动询问${other}的菜品、歌曲或景点推荐。` },
  { id: "M09", score: 2, minPlayers: 2, wordCount: 2, build: ({ target, word, secondWord }) => `10 分钟内，让${target}自然说出“${word}”和“${secondWord}”。` },
  { id: "M10", score: 2, minPlayers: 2, build: ({ target }) => `让${target}主动决定一次合照的站位或拍摄角度，并完成拍摄。` },
  { id: "M11", score: 2, minPlayers: 2, build: ({ target }) => `给${target}两个无害选项，让其选择后主动解释理由。` },
  { id: "M12", score: 2, minPlayers: 2, build: ({ target }) => `15 分钟内，让${target}在对话中自然提到三个不同地名。` },
  { id: "M13", score: 2, minPlayers: 3, build: ({ target }) => `让${target}在征得同行同意后主动组织一张至少 3 人的合照。` },
  { id: "M14", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}先后向你和${other}提出同一个无害问题。` },
  { id: "M15", score: 2, minPlayers: 2, wordCount: 1, build: ({ target, word }) => `让${target}先自然说出“${word}”，随后主动询问时间。` },
  { id: "M16", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}提出一种适合分享的小吃，并让${other}表示愿意尝试。` },
  { id: "M17", score: 2, minPlayers: 2, build: ({ target }) => `让${target}纠正一个地名或菜名的读法，并补充一句解释。` },
  { id: "M18", score: 2, minPlayers: 2, wordCount: 2, build: ({ target, word, secondWord }) => `让${target}在两次不同对话中分别说出“${word}”和“${secondWord}”。` },
  { id: "M19", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}推荐一项行程内活动，并让${other}明确表示赞同。` },
  { id: "M20", score: 2, minPlayers: 3, build: ({ target }) => `让${target}主动发起一次合照倒计时，并完成拍摄。` },
  { id: "M21", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}分别问你和${other}一句“准备好了吗”。` },
  { id: "M22", score: 2, minPlayers: 2, build: ({ target }) => `让${target}主动打开地图或导航，并向你说明下一段路线。` },
  { id: "M23", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}分享一条无害旅行小技巧，并让${other}回应“有用”或同义表达。` },
  { id: "M24", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}主动帮${other}确认一项公开的集合信息。` },
  { id: "M25", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}选择一个合照背景，并邀请${other}一起完成拍摄。` },
  { id: "M26", score: 2, minPlayers: 2, build: ({ target }) => `让${target}先说“先等等”，之后再主动说“走吧”。` },
  { id: "M27", score: 2, minPlayers: 2, build: ({ target }) => `让${target}口头列出三件适合当天行程携带的普通物品。` },
  { id: "M28", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}主动询问${other}今天目前最喜欢的一个瞬间。` },
  { id: "M29", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}发起两种食物的二选一，并让${other}完成选择。` },
  { id: "M30", score: 2, minPlayers: 3, build: ({ target }) => `让${target}设计一个简单安全的集体拍照姿势，并让大家完成。` },
  { id: "M31", score: 2, minPlayers: 2, build: ({ target }) => `5 分钟内，让${target}连续向你提出三个不同的无害问题。` },
  { id: "M32", score: 2, minPlayers: 2, wordCount: 1, build: ({ target, word }) => `让${target}在说出你的名字前后，自然带出“${word}”。` },
  { id: "M33", score: 2, minPlayers: 3, build: ({ target }) => `让${target}在征得同意后主动提出为同行拍照，并完成拍摄。` },
  { id: "M34", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}主动确认${other}是否已经跟上队伍。` },
  { id: "M35", score: 2, minPlayers: 3, build: ({ target, other }) => `让${target}提出一个集合时间，并让${other}明确确认。` },
  { id: "H01", score: 3, minPlayers: 3, wordCount: 1, build: ({ target, other, word }) => `让${target}在不知情的情况下，引导${other}说出“${word}”。` },
  { id: "H02", score: 3, minPlayers: 3, wordCount: 1, build: ({ target, other, word }) => `30 分钟内，让${target}和${other}在互不商量时分别说出“${word}”。` },
  { id: "H03", score: 3, minPlayers: 4, build: ({ target }) => `让${target}主动发起并完成一项至少 3 人参与、5 分钟以内的小活动。` },
  { id: "H04", score: 3, minPlayers: 4, build: ({ target, other }) => `让${target}主动邀请${other}参加一次至少 4 人的合照，并完成拍摄。` },
  { id: "H05", score: 3, minPlayers: 3, build: ({ target, other }) => `让${target}给出一项推荐，并自然说服${other}明确表示赞同。` },
  { id: "H06", score: 3, minPlayers: 2, wordCount: 1, build: ({ target, word }) => `15 分钟内，让${target}依次说出你的名字、递给你一件允许物品、再说出“${word}”。` },
  { id: "H07", score: 3, minPlayers: 3, build: ({ target, other }) => `让${target}纠正你一个无关紧要的错误，再主动请${other}确认。` },
  { id: "H08", score: 3, minPlayers: 3, build: ({ target, other }) => `15 分钟内，让${target}分别向你和${other}提出两个不同问题，其中一个包含“为什么”，另一个包含“哪里”。` },
  { id: "H09", score: 3, minPlayers: 4, build: ({ target, other }) => `让${target}先向${other}提问，再由${other}主动把同类问题问给另一名同行。` },
  { id: "H10", score: 3, minPlayers: 3, wordCount: 2, build: ({ target, other, word, secondWord }) => `让${target}自然说出“${word}”，并引导${other}自然说出“${secondWord}”。` },
  { id: "H11", score: 3, minPlayers: 4, build: ({ target }) => `让${target}发起一次至少 4 人参与的二选一表决，并主动宣布结果。` },
  { id: "H12", score: 3, minPlayers: 4, build: ({ target }) => `让${target}主动组织至少 4 人合照、决定安全姿势并完成倒计时。` },
  { id: "H13", score: 3, minPlayers: 4, build: ({ target }) => `让${target}分享一条旅行建议，并获得至少两名同行的明确赞同。` },
  { id: "H14", score: 3, minPlayers: 3, build: ({ target, other }) => `让${target}分别询问你和${other}的推荐，再主动选择其中一个。` },
  { id: "H15", score: 3, minPlayers: 3, build: ({ target, other }) => `让${target}引导${other}向你提出一个包含“哪里”或“为什么”的问题。` },
  { id: "H16", score: 3, minPlayers: 3, wordCount: 1, build: ({ target, other, word }) => `让${target}依次说出你的名字、“${word}”，再主动向${other}提问。` },
  { id: "H17", score: 3, minPlayers: 4, build: ({ target }) => `让${target}发起一次至少 3 人参与的路线讨论，并总结出一致选择。` },
  { id: "H18", score: 3, minPlayers: 4, build: ({ target }) => `让${target}主动发起一轮不超过 3 分钟的安全小游戏，并让至少 3 人参与。` },
  { id: "H19", score: 3, minPlayers: 4, build: ({ target }) => `让${target}设计一句简短旅行口号，并带领至少 3 人一起说出。` },
  { id: "H20", score: 3, minPlayers: 2, build: ({ target }) => `20 分钟内，让${target}在不同对话中自然提到三项当天行程细节。` },
  { id: "H21", score: 3, minPlayers: 4, build: ({ target }) => `让${target}把同一个安全景点或菜品推荐给两名不同同行。` },
  { id: "H22", score: 3, minPlayers: 4, build: ({ target, other }) => `让${target}请${other}帮忙拍一张合照，并主动邀请另一名同行加入。` },
  { id: "H23", score: 3, minPlayers: 4, build: ({ target }) => `让${target}发起两种当地食物的比较，并让至少两人说出各自选择。` },
  { id: "H24", score: 3, minPlayers: 4, build: ({ target }) => `让${target}主动开始一段当天行程回顾，并让至少两名同行补充细节。` },
  { id: "H25", score: 3, minPlayers: 3, wordCount: 2, build: ({ target, other, word, secondWord }) => `让${target}自然说出“${word}”和“${secondWord}”，再让${other}重复其中一个词。` },
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
  const randomWords = task.wordCount === 2 ? [word, secondWord] : task.wordCount === 1 ? [word] : [];
  const code = `${task.id}-${Math.floor(random() * 46656).toString(36).padStart(3, "0").toUpperCase()}`;

  return {
    uid: makeId("mission", random, now),
    taskId: task.id,
    code,
    score: task.score,
    targetId: target.id,
    targetName: playerLabel(target),
    randomWords,
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
