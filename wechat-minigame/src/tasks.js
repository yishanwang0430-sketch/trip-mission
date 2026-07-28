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

