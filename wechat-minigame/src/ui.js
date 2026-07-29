const COLORS = {
  ink: "#243238",
  muted: "#6c7776",
  canvas: "#edf1ed",
  paper: "#fffdf7",
  paperWarm: "#f7f0df",
  line: "#d7ded9",
  jade: "#39735b",
  jadeDark: "#285343",
  jadeSoft: "#dfece4",
  red: "#b64b43",
  redDark: "#853630",
  redSoft: "#f3dfdc",
  gold: "#bd8a32",
  goldSoft: "#f3e7cb",
  blue: "#426d85",
  blueSoft: "#dfeaf0",
  wood: "#8b6240",
  woodDark: "#62452f",
  woodLight: "#b4885e",
  white: "#ffffff",
};

const STATUS_LABELS = {
  lobby: "等待同行",
  playing: "旅程进行中",
  review: "每日复盘",
  ended: "旅程结束",
};

const TOUCH_SLOP = 12;

function getWindowInfo() {
  if (wx.getWindowInfo) return wx.getWindowInfo();
  return wx.getSystemInfoSync();
}

class GameRenderer {
  constructor(app) {
    this.app = app;
    this.info = getWindowInfo();
    this.width = this.info.windowWidth;
    this.height = this.info.windowHeight;
    this.dpr = Math.min(this.info.pixelRatio || 1, 3);
    this.safeTop = Math.max(8, this.info.safeArea?.top || 8);
    this.safeBottom = Math.max(8, this.height - (this.info.safeArea?.bottom || this.height));
    this.headerHeight = this.safeTop + 64;
    this.navHeight = 72 + this.safeBottom;
    this.canvas = wx.createCanvas();
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx = this.canvas.getContext("2d");
    this.hits = [];
    this.scrollByScreen = {};
    this.maxScroll = 0;
    this.touch = null;
    this.model = null;
    this.logo = wx.createImage();
    this.logo.onload = () => this.render(this.model);
    this.logo.src = "assets/app-icon-192.png";
    this.bindTouches();
  }

  bindTouches() {
    wx.onTouchStart((event) => {
      const point = event.touches?.[0];
      if (!point) return;
      this.touch = {
        x: point.clientX,
        y: point.clientY,
        startY: point.clientY,
        startScroll: this.currentScroll(),
        moved: false,
      };
    });
    wx.onTouchMove((event) => {
      if (!this.touch || this.model?.overlayPicker) return;
      const point = event.touches?.[0];
      if (!point) return;
      const delta = point.clientY - this.touch.startY;
      const distance = Math.hypot(point.clientX - this.touch.x, point.clientY - this.touch.y);
      if (distance > TOUCH_SLOP) this.touch.moved = true;
      if (this.touch.moved && this.maxScroll > 0 && this.touch.startY > this.headerHeight && this.touch.startY < this.height - this.navHeight) {
        const next = Math.max(0, Math.min(this.maxScroll, this.touch.startScroll - delta));
        this.scrollByScreen[this.model.screen] = next;
        this.render(this.model);
      }
    });
    wx.onTouchEnd((event) => {
      if (!this.touch) return;
      const point = event.changedTouches?.[0] || this.touch;
      const moved = this.touch.moved || Math.hypot(point.clientX - this.touch.x, point.clientY - this.touch.y) > TOUCH_SLOP;
      if (!moved) {
        const hit = [...this.hits].reverse().find((item) => (
          point.clientX >= item.x && point.clientX <= item.x + item.width
          && point.clientY >= item.y && point.clientY <= item.y + item.height
        ));
        if (hit && !this.model?.busy) {
          wx.vibrateShort?.({ type: "light" });
          this.app.handleAction(hit.action, hit.payload);
        }
      }
      this.touch = null;
    });
  }

  currentScroll() {
    return this.scrollByScreen[this.model?.screen] || 0;
  }

  resetScroll(screen) {
    this.scrollByScreen[screen] = 0;
  }

  render(model) {
    if (!model) return;
    this.model = model;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.hits = [];
    this.maxScroll = 0;
    this.drawBackground();

    if (model.screen === "home") this.drawHome(model);
    else if (model.screen === "lobby") this.drawLobby(model);
    else if (model.screen === "hidden_editor") this.drawHiddenEditor(model);
    else if (model.screen === "missions") this.drawMissions(model);
    else if (model.screen === "ranking") this.drawRanking(model);
    else if (model.screen === "review") this.drawReview(model);
    else this.drawHome(model);

    if (model.overlayPicker) this.drawPicker(model.overlayPicker);
    if (model.toast) this.drawToast(model.toast);
    if (model.busy) this.drawBusy();
  }

  drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.canvas;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = "rgba(57,115,91,0.055)";
    ctx.lineWidth = 1;
    for (let x = 14; x < this.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 70, this.height);
      ctx.stroke();
    }
  }

  roundRect(x, y, width, height, radius = 8) {
    const ctx = this.ctx;
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  panel(x, y, width, height, fill = COLORS.paper, stroke = COLORS.line, radius = 8) {
    const ctx = this.ctx;
    this.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  text(value, x, y, size = 14, color = COLORS.ink, align = "left", weight = "400") {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), x, y);
    ctx.restore();
  }

  wrapText(value, x, y, maxWidth, lineHeight = 24, maxLines = 4, options = {}) {
    const ctx = this.ctx;
    const characters = Array.from(String(value));
    const lines = [];
    let line = "";
    ctx.save();
    ctx.font = `${options.weight || "400"} ${options.size || 16}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    for (const character of characters) {
      const next = line + character;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = next;
      }
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.join("").length < characters.length && lines.length) {
      let finalLine = lines[lines.length - 1];
      while (finalLine && ctx.measureText(`${finalLine}…`).width > maxWidth) finalLine = finalLine.slice(0, -1);
      lines[lines.length - 1] = `${finalLine}…`;
    }
    ctx.restore();
    lines.forEach((item, index) => this.text(
      item,
      x,
      y + index * lineHeight,
      options.size || 16,
      options.color || COLORS.ink,
      options.align || "left",
      options.weight || "400",
    ));
    return lines.length * lineHeight;
  }

  hit(action, x, y, width, height, payload = null) {
    if (x + width < 0 || x > this.width || y + height < 0 || y > this.height) return;
    this.hits.push({ action, x, y, width, height, payload });
  }

  button({ x, y, width, height = 48, label, action, payload, kind = "primary", icon = null, disabled = false }) {
    const palette = {
      primary: [COLORS.jade, COLORS.white, COLORS.jadeDark],
      secondary: [COLORS.paper, COLORS.ink, COLORS.line],
      danger: [COLORS.redSoft, COLORS.redDark, "#d7aaa5"],
      gold: [COLORS.goldSoft, "#71521c", "#ddc38c"],
      dark: [COLORS.ink, COLORS.white, COLORS.ink],
    }[kind];
    this.panel(x, y, width, height, disabled ? "#e6e9e7" : palette[0], disabled ? "#d5dad7" : palette[2], 8);
    const labelX = icon && label ? x + width / 2 + 10 : x + width / 2;
    if (icon) {
      this.ctx.save();
      this.ctx.font = "600 15px \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
      const textWidth = this.ctx.measureText(label).width;
      this.ctx.restore();
      const iconX = label ? labelX - textWidth / 2 - 15 : x + width / 2;
      this.icon(icon, iconX, y + height / 2, disabled ? "#9aa29f" : palette[1], 19);
    }
    this.text(label, labelX, y + height / 2 + 0.5, 15, disabled ? "#9aa29f" : palette[1], "center", "600");
    if (!disabled) this.hit(action, x, y, width, height, payload);
  }

  icon(name, x, y, color = COLORS.ink, size = 20) {
    const ctx = this.ctx;
    const s = size / 20;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (name === "dice") {
      ctx.rect(-8, -8, 16, 16);
      ctx.stroke();
      for (const [dx, dy] of [[-4, -4], [4, 4], [0, 0]]) {
        ctx.beginPath(); ctx.arc(dx, dy, 1.25, 0, Math.PI * 2); ctx.fill();
      }
    } else if (name === "rank") {
      ctx.moveTo(-8, 8); ctx.lineTo(-8, 1); ctx.lineTo(-3, 1); ctx.lineTo(-3, 8);
      ctx.moveTo(-2, 8); ctx.lineTo(-2, -7); ctx.lineTo(3, -7); ctx.lineTo(3, 8);
      ctx.moveTo(4, 8); ctx.lineTo(4, -2); ctx.lineTo(9, -2); ctx.lineTo(9, 8); ctx.stroke();
    } else if (name === "review") {
      ctx.rect(-7, -8, 14, 16); ctx.moveTo(-3, -8); ctx.lineTo(-3, -10); ctx.lineTo(3, -10); ctx.lineTo(3, -8);
      ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.moveTo(-4, 3); ctx.lineTo(2, 3); ctx.stroke();
    } else if (name === "users") {
      ctx.arc(-3, -4, 3.5, 0, Math.PI * 2); ctx.moveTo(-9, 8); ctx.quadraticCurveTo(-3, 1, 3, 8);
      ctx.moveTo(5, -6); ctx.arc(5, -3, 2.6, -Math.PI / 2, Math.PI * 1.5); ctx.moveTo(4, 2); ctx.quadraticCurveTo(9, 3, 10, 7); ctx.stroke();
    } else if (name === "share") {
      for (const [dx, dy] of [[-6, 0], [6, -7], [6, 7]]) { ctx.moveTo(dx + 2.2, dy); ctx.arc(dx, dy, 2.2, 0, Math.PI * 2); }
      ctx.moveTo(-4, -1); ctx.lineTo(4, -6); ctx.moveTo(-4, 1); ctx.lineTo(4, 6); ctx.stroke();
    } else if (name === "check") {
      ctx.moveTo(-8, 0); ctx.lineTo(-2, 6); ctx.lineTo(9, -7); ctx.stroke();
    } else if (name === "close") {
      ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
    } else if (name === "eye") {
      ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, -9, 9, 0); ctx.quadraticCurveTo(0, 9, -9, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (name === "plus") {
      ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
    } else if (name === "minus") {
      ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
    } else if (name === "seal") {
      ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -5.5); ctx.lineTo(3.5, 0); ctx.lineTo(0, -1); ctx.lineTo(-3.5, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 5.5); ctx.lineTo(3.5, 0); ctx.lineTo(0, 1); ctx.lineTo(-3.5, 0); ctx.closePath(); ctx.stroke();
    } else if (name === "back") {
      ctx.moveTo(6, -8); ctx.lineTo(-3, 0); ctx.lineTo(6, 8); ctx.stroke();
    } else if (name === "more") {
      for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.arc(dx, 0, 1.5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  drawLogo(x, y, size) {
    if (this.logo?.width) {
      this.ctx.drawImage(this.logo, x, y, size, size);
    } else {
      this.panel(x, y, size, size, COLORS.ink, null, 8);
      this.icon("seal", x + size / 2, y + size / 2, COLORS.red, Math.round(size * 0.56));
    }
  }

  drawHome(model) {
    const ctx = this.ctx;
    const center = this.width / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(57,115,91,0.25)";
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(28, 112);
    ctx.bezierCurveTo(95, 42, 188, 160, this.width - 26, 78);
    ctx.stroke();
    ctx.restore();
    for (const [x, y, color] of [[30, 112, COLORS.red], [this.width - 28, 78, COLORS.jade]]) {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 3; ctx.stroke();
    }

    this.drawLogo(center - 40, this.safeTop + 52, 80);
    this.text("游侠密令", center, this.safeTop + 156, 30, COLORS.ink, "center", "700");
    this.text("旅行中的隐秘任务", center, this.safeTop + 188, 14, COLORS.muted, "center", "400");

    const panelY = this.safeTop + 230;
    this.panel(20, panelY, this.width - 40, 126, COLORS.paper, COLORS.line, 8);
    this.text("房间人数", 40, panelY + 28, 14, COLORS.muted, "left", "500");
    this.text("开局后锁定", this.width - 40, panelY + 28, 12, COLORS.muted, "right", "400");
    this.button({ x: 40, y: panelY + 56, width: 48, height: 46, label: "", action: "capacity_down", kind: "secondary", icon: "minus", disabled: model.desiredCapacity <= 3 });
    this.text(`${model.desiredCapacity} 人`, center, panelY + 79, 22, COLORS.ink, "center", "700");
    this.button({ x: this.width - 88, y: panelY + 56, width: 48, height: 46, label: "", action: "capacity_up", kind: "secondary", icon: "plus", disabled: model.desiredCapacity >= 12 });

    const buttonY = panelY + 152;
    this.button({ x: 20, y: buttonY, width: this.width - 40, height: 54, label: "创建密令房", action: "create_room", icon: "users" });
    this.button({ x: 20, y: buttonY + 66, width: this.width - 40, height: 54, label: model.inviteCode ? `加入房间 ${model.inviteCode}` : "输入房间号", action: "join_room", kind: "secondary", icon: "seal" });
    this.hit("show_rules", center - 70, buttonY + 136, 140, 40);
    this.text("规则与安全边界", center, buttonY + 156, 13, COLORS.blue, "center", "500");
    this.text("v1.2.2 · 微信小游戏版", center, this.height - this.safeBottom - 22, 11, "#929a97", "center", "400");
  }

  drawHeader(model, title = "游侠密令") {
    const ctx = this.ctx;
    const brandedTitle = title === "游侠密令" ? title : `游侠密令 · ${title}`;
    ctx.fillStyle = "rgba(255,253,247,0.97)";
    ctx.fillRect(0, 0, this.width, this.headerHeight);
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath(); ctx.moveTo(0, this.headerHeight - 0.5); ctx.lineTo(this.width, this.headerHeight - 0.5); ctx.stroke();
    this.hit("noop", 0, 0, this.width, this.headerHeight);
    this.drawLogo(16, this.safeTop + 10, 40);
    this.text(brandedTitle, 66, this.safeTop + 24, 17, COLORS.ink, "left", "700");
    if (model.room) {
      const online = model.room.players.filter((player) => player.online).length;
      this.text(`${model.room.roomCode} · ${online}在线`, 66, this.safeTop + 44, 11, COLORS.muted, "left", "400");
    }
  }

  drawLobby(model) {
    this.drawHeader(model, "同行集结");
    const room = model.room;
    const contentTop = this.headerHeight + 18;
    this.text("房间号", 20, contentTop + 10, 12, COLORS.muted, "left", "500");
    this.text(room.roomCode, 20, contentTop + 44, 32, COLORS.ink, "left", "700");
    this.icon("back", 28, contentTop + 76, COLORS.redDark, 14);
    this.text("退出房间", 42, contentTop + 76, 12, COLORS.redDark, "left", "600");
    this.hit("leave_local", 16, contentTop + 58, 92, 36);
    this.button({ x: this.width - 184, y: contentTop + 18, width: 44, height: 44, label: "", action: "room_menu", kind: "secondary", icon: "more" });
    this.button({ x: this.width - 132, y: contentTop + 18, width: 112, height: 44, label: "邀请同行", action: "share_room", kind: "secondary", icon: "share" });

    const routeY = contentTop + 94;
    this.panel(20, routeY, this.width - 40, 58, COLORS.jadeSoft, "#b8d2c2", 8);
    this.text(`${room.players.length} / ${room.maxPlayers}`, 40, routeY + 21, 20, COLORS.jadeDark, "left", "700");
    this.text(room.players.length >= 3 ? "可以开局" : `还需 ${3 - room.players.length} 人`, 40, routeY + 42, 12, COLORS.jadeDark, "left", "500");
    const barX = 132;
    const barWidth = this.width - barX - 40;
    this.roundRect(barX, routeY + 25, barWidth, 8, 4); this.ctx.fillStyle = "rgba(40,83,67,0.15)"; this.ctx.fill();
    this.roundRect(barX, routeY + 25, barWidth * Math.min(1, room.players.length / room.maxPlayers), 8, 4); this.ctx.fillStyle = COLORS.jade; this.ctx.fill();

    this.text("同行名单", 20, routeY + 186 - 12, 15, COLORS.ink, "left", "700");
    const cardWidth = (this.width - 52) / 3;
    room.players.forEach((player, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const x = 20 + col * (cardWidth + 6);
      const y = routeY + 198 + row * 86;
      this.panel(x, y, cardWidth, 76, COLORS.paper, COLORS.line, 8);
      this.text(String(player.seat), x + 18, y + 20, 12, player.online ? COLORS.jade : COLORS.muted, "center", "700");
      this.ctx.beginPath(); this.ctx.arc(x + 18, y + 20, 12, 0, Math.PI * 2); this.ctx.strokeStyle = player.online ? COLORS.jade : COLORS.line; this.ctx.stroke();
      this.wrapText(player.name, x + 10, y + 48, cardWidth - 20, 16, 1, { size: 13, align: "left", weight: "600" });
      if (player.id === room.ownerPlayerId) this.text("房主", x + cardWidth - 10, y + 18, 10, COLORS.gold, "right", "600");
    });

    const rows = Math.ceil(room.players.length / 3);
    const actionY = Math.max(this.height - this.safeBottom - 76, routeY + 214 + rows * 86);
    const hidden = room.hiddenTask || { status: "unassigned", isEditor: false };
    if (hidden.status === "editing" && hidden.isEditor) {
      const editorActionY = Math.max(this.height - this.safeBottom - 124, routeY + 214 + rows * 86);
      this.panel(20, editorActionY - 8, this.width - 40, 116, COLORS.goldSoft, "#ddc38c", 8);
      this.icon("seal", 44, editorActionY + 18, COLORS.red, 22);
      this.text("你获得了隐藏任务设计资格", 64, editorActionY + 10, 14, COLORS.ink, "left", "700");
      this.text("提交后自动开局，且你本人不会抽到", 64, editorActionY + 34, 11, "#755d34", "left", "400");
      this.button({ x: 34, y: editorActionY + 54, width: this.width - 68, height: 44, label: "查看安全约定并编辑", action: "open_hidden_editor", icon: "seal" });
    } else if (hidden.status === "editing") {
      this.panel(20, actionY, this.width - 40, 66, COLORS.paperWarm, "#e2d4b5", 8);
      this.text("隐藏任务设计中", 36, actionY + 22, 14, "#755d34", "left", "700");
      this.text("提交后自动开局，请在此等待", 36, actionY + 45, 11, COLORS.muted, "left", "400");
    } else if (room.self.isOwner) {
      this.button({ x: 20, y: actionY, width: this.width - 40, height: 52, label: "抽选设计者并准备开局", action: "start_room", icon: "dice", disabled: room.players.length < 3 });
    } else {
      this.panel(20, actionY, this.width - 40, 52, COLORS.paperWarm, "#e2d4b5", 8);
      this.text("等待房主抽选隐藏任务设计者", this.width / 2, actionY + 26, 14, "#755d34", "center", "500");
    }
  }

  drawHiddenEditor(model) {
    this.drawHeader(model, "设计隐藏任务");
    let y = this.headerHeight + 18;
    this.panel(20, y, this.width - 40, 70, COLORS.goldSoft, "#ddc38c", 8);
    this.icon("seal", 46, y + 35, COLORS.red, 24);
    this.text("你是本房唯一的任务设计者", 68, y + 24, 15, COLORS.ink, "left", "700");
    this.text("任务会随机交给另一名同行", 68, y + 48, 11, "#755d34", "left", "400");
    y += 86;

    this.panel(20, y, this.width - 40, 230, COLORS.paper, COLORS.line, 8);
    this.text("提交前请确认", 36, y + 27, 16, COLORS.ink, "left", "700");
    const rules = [
      "不要求肢体接触、饮酒或危险动作",
      "不涉及隐私、财物、陌生人或违法内容",
      "不羞辱、不惊吓，不让任何人感到为难",
      "任何人不舒服都可以立即停止",
      "提交后不可修改，你本人不会抽到",
    ];
    rules.forEach((rule, index) => {
      const rowY = y + 62 + index * 31;
      this.ctx.beginPath(); this.ctx.arc(40, rowY, 3, 0, Math.PI * 2); this.ctx.fillStyle = COLORS.jade; this.ctx.fill();
      this.text(rule, 52, rowY, 13, index === 4 ? COLORS.redDark : COLORS.ink, "left", index === 4 ? "600" : "400");
    });
    y += 246;

    this.panel(20, y, this.width - 40, 104, COLORS.blueSoft, "#b8cfdb", 8);
    this.text("合适示例", 36, y + 24, 12, COLORS.blue, "left", "700");
    this.wrapText("让任意一位同行主动提议拍一张合照。", 36, y + 52, this.width - 72, 22, 2, { size: 14, color: COLORS.ink, weight: "500" });
    y += 120;

    this.button({ x: 20, y, width: this.width - 40, height: 52, label: "我已理解，开始填写", action: "edit_hidden_task", icon: "check" });
    this.hit("close_hidden_editor", this.width / 2 - 72, y + 62, 144, 38);
    this.icon("back", this.width / 2 - 50, y + 81, COLORS.muted, 16);
    this.text("返回同行大厅", this.width / 2 + 8, y + 81, 12, COLORS.muted, "center", "500");
    this.drawHeader(model, "设计隐藏任务");
  }

  drawScoreStrip(model, y) {
    const self = model.room.players.find((player) => player.id === model.room.self.id);
    const values = [
      ["总分", self?.totalScore || 0],
      ["今日", model.todayApprovedScore],
      ["剩余", model.remainingDraws],
    ];
    this.panel(20, y, this.width - 40, 72, COLORS.paper, COLORS.line, 8);
    const cell = (this.width - 40) / 3;
    values.forEach(([label, value], index) => {
      if (index) {
        this.ctx.beginPath(); this.ctx.moveTo(20 + index * cell, y + 14); this.ctx.lineTo(20 + index * cell, y + 58);
        this.ctx.strokeStyle = COLORS.line; this.ctx.stroke();
      }
      this.text(label, 20 + cell * index + cell / 2, y + 22, 11, COLORS.muted, "center", "500");
      this.text(value, 20 + cell * index + cell / 2, y + 49, 23, COLORS.ink, "center", "700");
    });
  }

  drawWoodBoard(x, y, width, height, task) {
    const ctx = this.ctx;
    this.roundRect(x, y, width, height, 8); ctx.fillStyle = COLORS.woodDark; ctx.fill();
    this.roundRect(x + 5, y + 5, width - 10, height - 10, 6); ctx.fillStyle = COLORS.wood; ctx.fill();
    ctx.save();
    ctx.strokeStyle = "rgba(55,35,22,0.22)";
    ctx.lineWidth = 1;
    for (let gy = y + 18; gy < y + height - 10; gy += 20) {
      ctx.beginPath(); ctx.moveTo(x + 12, gy); ctx.bezierCurveTo(x + width * 0.35, gy - 5, x + width * 0.7, gy + 6, x + width - 12, gy - 1); ctx.stroke();
    }
    ctx.restore();
    for (const [sx, sy] of [[x + 13, y + 13], [x + width - 13, y + 13], [x + 13, y + height - 13], [x + width - 13, y + height - 13]]) {
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fillStyle = COLORS.goldSoft; ctx.fill();
    }
    this.panel(x + 18, y + 18, width - 36, height - 36, COLORS.paperWarm, "#d8c8a5", 4);

    if (!task.revealed) {
      this.icon("seal", x + width / 2, y + height / 2 - 18, COLORS.red, 52);
      this.text("点击揭令", x + width / 2, y + height / 2 + 28, 15, COLORS.redDark, "center", "600");
      this.text("注意遮挡屏幕", x + width / 2, y + height / 2 + 51, 11, "#846f50", "center", "400");
      this.hit("toggle_task", x + 18, y + 18, width - 36, height - 36);
      return;
    }

    this.text(task.isHidden ? "本轮隐藏任务 · 3 分" : `${task.score} 分密令`, x + 34, y + 40, 12, task.score === 3 ? COLORS.redDark : COLORS.jadeDark, "left", "700");
    this.text(task.code, x + width - 34, y + 40, 11, "#8d8066", "right", "500");
    this.wrapText(task.description, x + 34, y + 84, width - 68, 28, 5, { size: 18, color: COLORS.ink, weight: "600" });
    this.text(`目标 ${task.targetName}`, x + 34, y + height - 54, 12, "#735f43", "left", "500");
    this.text("点击木板可重新遮住", x + width - 34, y + height - 54, 10, "#8d8066", "right", "400");
    this.hit("toggle_task", x + 18, y + 18, width - 36, height - 36);
  }

  drawApprovalCard(claim, y) {
    this.panel(20, y, this.width - 40, 112, COLORS.blueSoft, "#b8cfdb", 8);
    this.text("待你见证", 36, y + 21, 11, COLORS.blue, "left", "700");
    this.text(`${claim.playerSeat}号 · ${claim.playerName}`, 36, y + 48, 15, COLORS.ink, "left", "600");
    this.text(`${claim.taskCode} · ${claim.points} 分 · 目标 ${claim.targetName}`, 36, y + 69, 11, COLORS.muted, "left", "400");
    this.button({ x: this.width - 166, y: y + 80, width: 62, height: 28, label: "驳回", action: "reject_claim", payload: claim.id, kind: "danger" });
    this.button({ x: this.width - 96, y: y + 80, width: 76, height: 28, label: "确认", action: "approve_claim", payload: claim.id, kind: "primary" });
  }

  drawRandomWordPanel(task, y) {
    const words = Array.isArray(task.randomWords) ? task.randomWords : [];
    if (!words.length) return 0;
    this.panel(20, y, this.width - 40, 66, COLORS.goldSoft, "#ddc38c", 8);
    this.icon("dice", 42, y + 33, COLORS.gold, 20);
    this.text("本轮随机词", 60, y + 20, 11, "#71521c", "left", "600");
    this.text(words.map((word) => `“${word}”`).join("  "), 60, y + 44, 17, COLORS.ink, "left", "700");
    this.text("随任务锁定", this.width - 34, y + 33, 10, "#846f50", "right", "500");
    return 76;
  }

  drawHiddenTaskPanel(task, y) {
    if (!task.isHidden) return 0;
    this.panel(20, y, this.width - 40, 66, COLORS.redSoft, "#d7aaa5", 8);
    this.icon("seal", 42, y + 33, COLORS.red, 21);
    this.text("本轮隐藏任务", 60, y + 21, 13, COLORS.redDark, "left", "700");
    this.text("由同行设计，仅此一份", 60, y + 45, 11, COLORS.muted, "left", "400");
    this.text("3 分", this.width - 34, y + 33, 15, COLORS.redDark, "right", "700");
    return 76;
  }

  drawMissions(model) {
    this.drawHeader(model, "今日密令");
    const offset = -this.currentScroll();
    let y = this.headerHeight + 16 + offset;
    this.drawScoreStrip(model, y);
    y += 88;

    for (const claim of model.room.pendingApprovals.slice(0, 3)) {
      this.drawApprovalCard(claim, y);
      y += 122;
    }

    if (model.activeTask) {
      y += this.drawHiddenTaskPanel(model.activeTask, y);
      y += this.drawRandomWordPanel(model.activeTask, y);
      this.drawWoodBoard(20, y, this.width - 40, 300, model.activeTask);
      y += 314;
      this.text(`剩余 ${model.taskTimeLeft}`, 20, y + 10, 12, COLORS.muted, "left", "500");
      this.button({ x: 20, y: y + 30, width: 104, height: 48, label: "放弃", action: "abandon_task", kind: "danger", icon: "close" });
      this.button({ x: 134, y: y + 30, width: this.width - 154, height: 48, label: "完成并请见证", action: "complete_task", icon: "check" });
      y += 96;
    } else {
      this.drawEmptyMission(model, y);
      y += 276;
    }

    this.text("最近记录", 20, y + 10, 15, COLORS.ink, "left", "700");
    y += 30;
    const records = model.history.slice(0, 8);
    if (!records.length) {
      this.text("还没有任务记录", 20, y + 18, 13, COLORS.muted, "left", "400");
      y += 44;
    }
    for (const record of records) {
      this.panel(20, y, this.width - 40, 62, COLORS.paper, COLORS.line, 8);
      const statusColor = record.status === "approved" ? COLORS.jade : record.status === "pending" ? COLORS.gold : COLORS.muted;
      this.text(record.code, 34, y + 21, 13, COLORS.ink, "left", "600");
      this.text(model.statusLabel(record.status), this.width - 34, y + 21, 11, statusColor, "right", "600");
      this.text(`${record.score} 分 · ${record.targetName}`, 34, y + 43, 11, COLORS.muted, "left", "400");
      y += 70;
    }
    this.maxScroll = Math.max(0, y - offset - (this.height - this.navHeight - 12));
    this.drawNav(model);
    this.drawHeader(model, "今日密令");
  }

  drawEmptyMission(model, y) {
    this.panel(20, y, this.width - 40, 250, COLORS.paper, COLORS.line, 8);
    this.icon("seal", this.width / 2, y + 72, model.remainingDraws ? COLORS.red : COLORS.muted, 52);
    const title = model.remainingDraws ? "抽取一份私密任务" : "抽取额度已用完";
    this.text(title, this.width / 2, y + 122, 19, COLORS.ink, "center", "700");
    this.text(model.remainingDraws ? `还剩 ${model.remainingDraws} 次 · 每次使用后 6 小时恢复` : model.drawRefreshLabel, this.width / 2, y + 150, 12, COLORS.muted, "center", "400");
    this.button({ x: 54, y: y + 178, width: this.width - 108, height: 50, label: "随机抽取", action: "draw_task", icon: "dice", disabled: model.remainingDraws <= 0 });
  }

  drawNav(model) {
    const y = this.height - this.navHeight;
    this.ctx.fillStyle = "rgba(255,253,247,0.98)";
    this.ctx.fillRect(0, y, this.width, this.navHeight);
    this.ctx.beginPath(); this.ctx.moveTo(0, y + 0.5); this.ctx.lineTo(this.width, y + 0.5); this.ctx.strokeStyle = COLORS.line; this.ctx.stroke();
    const items = [
      ["missions", "密令", "dice"],
      ["ranking", "总榜", "rank"],
      ["review", model.room.status === "review" ? "复盘中" : "复盘", "review"],
      ["room_menu", "房间", "more"],
    ];
    const width = this.width / items.length;
    items.forEach(([screen, label, icon], index) => {
      const active = model.screen === screen;
      const center = width * index + width / 2;
      this.icon(icon, center, y + 24, active ? COLORS.jade : COLORS.muted, 21);
      this.text(label, center, y + 49, 11, active ? COLORS.jade : COLORS.muted, "center", active ? "700" : "500");
      if (screen === "review" && model.room.pendingApprovals.length) {
        this.ctx.beginPath(); this.ctx.arc(center + 15, y + 13, 8, 0, Math.PI * 2); this.ctx.fillStyle = COLORS.red; this.ctx.fill();
        this.text(model.room.pendingApprovals.length, center + 15, y + 13, 9, COLORS.white, "center", "700");
      }
      this.hit(screen === "room_menu" ? "room_menu" : "navigate", width * index, y, width, 64, screen === "room_menu" ? null : screen);
    });
  }

  drawRanking(model) {
    this.drawHeader(model, model.room.status === "ended" ? "旅程终榜" : "同行总榜");
    const offset = -this.currentScroll();
    let y = this.headerHeight + 18 + offset;
    this.panel(20, y, this.width - 40, 62, model.room.status === "ended" ? COLORS.goldSoft : COLORS.jadeSoft, null, 8);
    this.text(STATUS_LABELS[model.room.status], 36, y + 22, 12, model.room.status === "ended" ? "#71521c" : COLORS.jadeDark, "left", "600");
    this.text(`${model.room.players.length} 位同行`, 36, y + 43, 11, COLORS.muted, "left", "400");
    this.text("得分", this.width - 36, y + 32, 12, COLORS.muted, "right", "500");
    y += 78;

    model.ranking.forEach((player, index) => {
      const height = index < 3 ? 74 : 64;
      const fill = index === 0 ? COLORS.goldSoft : COLORS.paper;
      this.panel(20, y, this.width - 40, height, fill, index === 0 ? "#ddc38c" : COLORS.line, 8);
      const rankColor = index === 0 ? COLORS.gold : index === 1 ? COLORS.blue : index === 2 ? COLORS.red : COLORS.muted;
      this.ctx.beginPath(); this.ctx.arc(46, y + height / 2, 15, 0, Math.PI * 2); this.ctx.fillStyle = rankColor; this.ctx.fill();
      this.text(index + 1, 46, y + height / 2, 13, COLORS.white, "center", "700");
      this.text(`${player.seat}号 · ${player.name}`, 72, y + height / 2 - 10, 14, COLORS.ink, "left", "600");
      const stateLabel = player.present === false ? "暂离本轮" : player.online ? "在线" : "在场";
      this.text(stateLabel, 72, y + height / 2 + 13, 10, player.present === false ? COLORS.red : player.online ? COLORS.jade : COLORS.muted, "left", "500");
      this.text(player.totalScore, this.width - 40, y + height / 2, 24, COLORS.ink, "right", "700");
      y += height + 8;
    });

    if (model.room.self.isOwner && model.room.status === "playing") {
      this.button({ x: 20, y: y + 8, width: this.width - 40, height: 48, label: "进入今日复盘", action: "enter_review", kind: "secondary", icon: "review" });
      y += 68;
    }
    if (model.room.self.isOwner && model.room.status !== "ended") {
      this.hit("end_room", this.width / 2 - 70, y + 6, 140, 40);
      this.text("结束整段旅程", this.width / 2, y + 26, 12, COLORS.redDark, "center", "500");
      y += 54;
    }
    if (model.room.self.isOwner && model.room.status === "ended") {
      this.hit("delete_room", this.width / 2 - 86, y + 6, 172, 40);
      this.text("永久删除房间数据", this.width / 2, y + 26, 12, COLORS.redDark, "center", "600");
      y += 54;
    }
    this.maxScroll = Math.max(0, y - offset - (this.height - this.navHeight - 12));
    if (model.room.status !== "ended") this.drawNav(model);
    else {
      this.button({ x: 20, y: this.height - this.safeBottom - 62, width: this.width - 40, height: 50, label: "返回首页", action: "leave_local", kind: "dark", icon: "back" });
    }
    this.drawHeader(model, model.room.status === "ended" ? "旅程终榜" : "同行总榜");
  }

  drawReview(model) {
    this.drawHeader(model, "每日复盘");
    const offset = -this.currentScroll();
    let y = this.headerHeight + 18 + offset;
    if (model.room.status !== "review") {
      this.panel(20, y, this.width - 40, 154, COLORS.paper, COLORS.line, 8);
      this.icon("review", this.width / 2, y + 44, COLORS.blue, 32);
      this.text("尚未进入复盘", this.width / 2, y + 83, 18, COLORS.ink, "center", "700");
      this.text("房主可从总榜开启今日复盘", this.width / 2, y + 111, 12, COLORS.muted, "center", "400");
      if (model.room.self.isOwner) this.button({ x: 54, y: y + 166, width: this.width - 108, height: 48, label: "开启复盘", action: "enter_review", icon: "review" });
      y += 232;
    } else {
      this.panel(20, y, this.width - 40, 66, COLORS.blueSoft, "#b8cfdb", 8);
      this.text(model.reviewDateLabel, 36, y + 22, 13, COLORS.blue, "left", "700");
      this.text(`${model.room.reviews.length}/${model.room.players.length} 人已复盘`, 36, y + 45, 11, COLORS.muted, "left", "400");
      this.button({ x: this.width - 116, y: y + 11, width: 96, height: 44, label: model.myReview ? "修改" : "选择", action: "write_review", kind: "secondary" });
      y += 82;

      const notes = model.room.reviews;
      if (!notes.length) {
        this.text("等待大家选择今日印象", 20, y + 18, 13, COLORS.muted, "left", "400");
        y += 48;
      }
      for (const review of notes) {
        const height = 86;
        this.panel(20, y, this.width - 40, height, review.isWinner ? COLORS.goldSoft : COLORS.paper, review.isWinner ? "#ddc38c" : COLORS.line, 8);
        this.text(`${review.playerSeat}号 · ${review.playerName}`, 34, y + 21, 13, COLORS.ink, "left", "600");
        if (review.isWinner) this.text("最佳妙计 +1", this.width - 34, y + 21, 11, "#71521c", "right", "700");
        this.wrapText(review.note || "已完成复盘", 34, y + 48, this.width - 68, 19, 2, { size: 12, color: COLORS.muted });
        y += height + 8;
      }

      if (model.room.self.isOwner) {
        const hasWinner = notes.some((item) => item.isWinner);
        this.button({ x: 20, y: y + 6, width: this.width - 40, height: 48, label: hasWinner ? "今日最佳已选" : "选择今日最佳", action: "award_review", kind: "gold", icon: "seal", disabled: hasWinner || !notes.length });
        this.button({ x: 20, y: y + 64, width: this.width - 40, height: 48, label: "完成复盘，继续旅程", action: "resume_room", icon: "check" });
        y += 130;
      }
    }
    this.maxScroll = Math.max(0, y - offset - (this.height - this.navHeight - 12));
    this.drawNav(model);
    this.drawHeader(model, "每日复盘");
  }

  drawPicker(picker) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(20,29,31,0.58)";
    ctx.fillRect(0, 0, this.width, this.height);
    const cols = picker.options.length > 6 ? 2 : 1;
    const rows = Math.ceil(picker.options.length / cols);
    const width = this.width - 32;
    const rowHeight = 48;
    const height = 72 + rows * rowHeight + 62;
    const y = Math.max(this.safeTop + 16, (this.height - height) / 2);
    this.panel(16, y, width, height, COLORS.paper, null, 8);
    this.text(picker.title, 34, y + 31, 17, COLORS.ink, "left", "700");
    this.icon("close", this.width - 42, y + 31, COLORS.muted, 18);
    this.hit("close_picker", this.width - 66, y + 8, 48, 46);
    const gap = 8;
    const itemWidth = cols === 2 ? (width - 52) / 2 : width - 36;
    picker.options.forEach((option, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = 34 + col * (itemWidth + gap);
      const itemY = y + 58 + row * rowHeight;
      this.panel(x, itemY, itemWidth, 40, COLORS.canvas, COLORS.line, 6);
      this.text(option.label, x + 12, itemY + 20, 13, COLORS.ink, "left", "600");
      this.hit("picker_select", x, itemY, itemWidth, 40, option.value);
    });
    this.text(picker.help || "选择后立即提交", this.width / 2, y + height - 28, 11, COLORS.muted, "center", "400");
  }

  drawToast(message) {
    const width = Math.min(this.width - 40, Math.max(170, String(message).length * 14 + 34));
    const y = this.height - this.navHeight - 64;
    this.panel((this.width - width) / 2, y, width, 42, COLORS.ink, null, 8);
    this.text(message, this.width / 2, y + 21, 13, COLORS.white, "center", "500");
  }

  drawBusy() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(237,241,237,0.62)";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.beginPath(); ctx.arc(this.width / 2, this.height / 2, 21, 0, Math.PI * 2); ctx.fillStyle = COLORS.ink; ctx.fill();
    this.text("···", this.width / 2, this.height / 2 - 2, 16, COLORS.white, "center", "700");
  }
}

module.exports = { COLORS, GameRenderer };
