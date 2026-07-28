# 旅游密令 · 微信小游戏版

这是与仓库根目录 H5 完全独立的微信小游戏工程。根目录网页仍按原地址发布；本目录使用微信小游戏 Canvas 运行时，名称为“旅游密令”。

## 已实现

- 房主自定义 3–12 人容量，开局后锁定。
- 6 位房间号和微信转发邀请。
- 大厅、房主开局、旅程中、每日复盘、旅程结束五个阶段。
- 每人每天 2 次私密任务，任务仅保存在本人设备，2 小时后超时。
- 1、2、3 分任务；指定见证人确认后才正式计分。
- 网络中断时保留待提交计分，恢复后自动重试。
- 在线状态和“暂离本轮 / 重新归队”；暂离玩家不会成为任务目标。
- 同行总榜、预设复盘印象、房主评选“最佳妙计 +1”。
- 房主结束旅程后可永久删除整个房间数据。
- 木质密令板、纸张、印章和地图路线风格的克制游戏化界面。

## 导入微信开发者工具

1. 在微信开发者工具中选择“小游戏”，导入本目录 `wechat-minigame/`。
2. 将 [`project.config.json`](project.config.json) 中的 `touristappid` 替换为已申请的小游戏 AppID，或在开发者工具中重新选择 AppID。
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
- 旅行代号与复盘内容均使用服务端白名单，首版不接收任意公开文本。
- 计分按任务 UID 幂等；重复请求不会重复加分。

## 上线前后台配置

- 名称：`旅游密令`
- 一级类目：`游戏`
- 二级类目：`休闲`
- 按后台当前选项选择最接近休闲、派对或社交互动的三级类目。
- 完成小游戏备案、隐私保护指引和适龄提示。
- 隐私说明应披露：本机会生成随机设备凭证；房间会保存代号、座位号、计分、在场状态和复盘标签。
- 当前版本不请求头像、微信昵称、位置、相册、通讯录、摄像头或麦克风。
- 首版不包含广告、支付、抽奖、现金或实物奖励。

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
http://127.0.0.1:4187/wechat-minigame/preview/?demo=task
http://127.0.0.1:4187/wechat-minigame/preview/?demo=review
http://127.0.0.1:4187/wechat-minigame/preview/?demo=ended
```

## 验证命令

```bash
npm test
node wechat-minigame/tests/backend-smoke.js
```

后端烟雾测试会创建一个三人测试房间，走完见证计分、复盘、结算和删除流程，并自动清理测试数据。
