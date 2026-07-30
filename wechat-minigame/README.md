# 游侠密令 · 微信小游戏版

这是与仓库根目录 H5 完全独立的微信小游戏工程。根目录网页仍按原地址发布；本目录使用微信小游戏 Canvas 运行时，名称为“游侠密令”。

## 已实现

- 房主自定义 3–12 人容量，开局后锁定。
- 玩家创建或加入房间时输入自定义昵称，旅途中也可修改；座位号用于区分同名玩家。
- 6 位房间号和微信转发邀请。
- 大厅、房主开局、轮次任务、本轮复盘、旅程结束五个阶段。
- 内置 100 条安全任务；每轮一次抽取 3 条，全部立即揭晓并同时计时 2 小时，可按任意顺序完成。
- 每人最多保留 3 个“整组抽取”额度，每组使用后 6 小时恢复；同一轮不能重复抽取。
- 涉及日常用语的任务会同时抽取并显示本轮随机词；随机词随任务保存在本机，下一次抽取任务时才会更换。
- 每个新房间固定 1 条玩家自创隐藏任务：开局时随机选出设计者和另一名接收者，设计者提交后自动开局，接收者下一次抽取时收到隐藏任务。
- 隐藏任务固定 3 分且每房只能领取一次；设计者本人不能抽到，也看不到接收者身份。
- 1、2、3 分任务；指定见证人确认后才正式计分。
- 三条任务分别选择见证人；一条见证通过后只划掉该条，其余任务继续计时。
- 房主在全员任务结算或本轮倒计时结束后开启复盘，复盘后在同一房间进入下一轮。
- 上一轮得分最高者发布下一轮 5 分悬赏；发布者也可挑战，首位见证通过者得 5 分。
- 每 4 轮累计得分最高者，可在“恶搞奖励”和“荣誉奖励”中二选一，再随机揭晓结果。
- 网络中断时保留待提交计分，恢复后自动重试。
- 在线状态和“暂离本轮 / 重新归队”；暂离玩家不会成为任务目标。
- 同行总榜、预设复盘印象、房主评选“最佳妙计 +1”。
- 房主结束旅程后可永久删除整个房间数据。
- 木质密令板、纸张、印章和地图路线风格的克制游戏化界面。

## 导入微信开发者工具

1. 在微信开发者工具中选择“小游戏”，导入本目录 `wechat-minigame/`。
2. [`project.config.json`](project.config.json) 已配置小游戏 AppID `wx1ff4c15692a4e10f`；导入后确认开发者工具显示“游侠密令”。
3. 在微信公众平台的“开发管理 → 开发设置 → 服务器域名”中，将下面地址加入 **request 合法域名**：

   ```text
   https://pdahxhpgxmsqntoozsgo.supabase.co
   ```

4. 编译后使用“预览”生成开发二维码，并至少用两台真机测试建房、加入和见证确认。

开发者工具可临时关闭域名校验，但真机预览和正式版本必须配置合法域名。当前 `project.config.json` 保留 `urlCheck: true`，防止上线前遗漏配置。

## 后端

小游戏使用 [`../supabase/minigame-schema.sql`](../supabase/minigame-schema.sql) 中独立的 `secret_*` 表和 RPC。它们已经部署到当前关联的 Supabase 项目，不修改 H5 使用的 `trip_*` 对象。

- 浏览器/小游戏只持有公开的 Supabase publishable key。
- 所有表均启用 RLS，`anon` 没有表级直接读写权限。
- 公开 RPC 使用本机随机 UUID 凭证检查房间成员和房主权限。
- 昵称由服务端限制为 1–12 个字符，复盘内容继续使用固定选项。
- 昵称、隐藏任务和悬赏任务在本地规则校验后，还必须通过微信 `security.msgSecCheck` v2；检查服务不可用时禁止提交，不会降级绕过。
- 隐藏任务限制为 8–80 字，并在客户端和服务端同时拦截危险、违法、隐私、财物、陌生人互动等内容。
- 隐藏任务的设计者、接收者和领取状态由服务端原子分配，确保每个房间只有一条且设计者不能领取。
- 计分按任务 UID 幂等；重复请求不会重复加分。

## 上线前后台配置

- 名称：`游侠密令`
- 一级类目：`游戏`
- 二级类目：`休闲`
- 按后台当前选项选择最接近休闲、派对或社交互动的三级类目。
- 完成小游戏备案、隐私保护指引和适龄提示。
- 自定义昵称、隐藏任务和悬赏任务已接入微信 `msgSecCheck` v2。当前没有用户图片上传功能，因此不适用 `imgSecCheck`。
- 隐私说明应披露：本机会生成随机设备凭证；房间会保存玩家自定义昵称、隐藏任务文字、座位号、计分、在场状态和复盘标签。
- 当前版本不请求头像、微信昵称、位置、相册、通讯录、摄像头或麦克风。
- 首版不包含广告、支付、抽奖、现金或实物奖励。

## 微信内容安全云函数

1. 首次使用时，在微信开发者工具的“云开发”面板开通环境。
2. 右键 `cloudfunctions/contentSecurity`，选择“上传并部署：云端安装依赖”。
3. 部署后在云函数列表确认 `contentSecurity` 存在，再用真机分别测试昵称、隐藏任务和悬赏任务。

CLI 部署格式：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env <云环境 ID> --names contentSecurity --remote-npm-install \
  --project "/Users/wangyaya/Desktop/旅途密令/wechat-minigame" --port 9420 --lang zh
```

## 浏览器视觉预览

预览只用于检查 Canvas 布局，不代替微信真机测试：

```bash
npm run build:minigame-preview
python3 -m http.server 4187
```

打开以下地址：

```text
http://127.0.0.1:4187/wechat-minigame/preview/
http://127.0.0.1:4187/wechat-minigame/preview/?demo=lobby
http://127.0.0.1:4187/wechat-minigame/preview/?demo=hidden-editor
http://127.0.0.1:4187/wechat-minigame/preview/?demo=hidden-task
http://127.0.0.1:4187/wechat-minigame/preview/?demo=task
http://127.0.0.1:4187/wechat-minigame/preview/?demo=bounty-editor
http://127.0.0.1:4187/wechat-minigame/preview/?demo=reward
http://127.0.0.1:4187/wechat-minigame/preview/?demo=review
http://127.0.0.1:4187/wechat-minigame/preview/?demo=ended
```

## 验证命令

```bash
npm test
node wechat-minigame/tests/backend-smoke.js
```

后端烟雾测试会创建一个三人测试房间，验证隐藏任务、见证计分、三任务轮次、5 分悬赏、复盘、四轮奖励和删除流程，并自动清理测试数据。
