# 叮咚小组 · 每日打卡

一个适合朋友、小团队的中文卡通风格网站：上午/下午记录、自动保存草稿、每日任务、空间群聊和私聊，支持手机、平板和桌面。

## 本地启动

需要 Node.js 24 LTS 和 pnpm 10。

~~~powershell
pnpm install
pnpm dev
~~~

打开 http://localhost:3000 。默认使用真正的 PostgreSQL（PGlite），数据存放在项目的 .data/postgres，不需要先注册云服务。用两个不同浏览器或普通窗口＋隐私窗口即可模拟不同成员。

创建空间 → 保存邀请码 → 朋友填写昵称和邀请码加入。身份保存在 HttpOnly Cookie，有效期30天；清除浏览器数据、换设备或退出后需要重新加入，昵称不能用于恢复身份。创建者丢失浏览器会话后无法自行恢复管理权限，首版没有账号找回。

## 功能

- 上下午分别记录，网络保存延迟600ms，本地草稿每次编辑持久化；断线可恢复，冲突展示两个版本。
- 日期选择和历史补写；完成打卡与任务完成独立。
- 小组任务全部可见，只有创建者能编辑、勾选、删除。
- 群聊、成员私聊、历史分页、消息重试去重、未读新消息提示。
- 邀请码只展示一次，可轮换；移除成员、转交创建者、退出空间。
- 空间数据每2秒通过服务端事件流检查并刷新；断线后补拉，权限失效清空界面。
- 手机底部导航，平板可收起侧栏，桌面完整侧栏。统一按北京时间记录。

## 验证

~~~powershell
pnpm test
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm build
pnpm test:e2e
~~~

Windows 的浏览器测试默认使用已安装的 Microsoft Edge；其他系统先运行 pnpm exec playwright install chromium。
PostgreSQL 集成测试在独立内存库中真正执行迁移、事务、权限与并发场景；不会使用本地体验数据。

## Supabase 和部署

见 [部署说明](docs/deployment.md)。支持本地持久化的单实例 Node 服务，也支持配置 Supabase 作为数据库。不要将本地数据目录部署到临时磁盘或多个实例共享使用。

接口使用自定义浏览器成员会话，所有数据库操作经过服务端鉴权。Supabase 的 anon/authenticated 角色禁止直接读写业务表，service-role 密钥只在服务端；浏览器实时更新走经过会话检查的 SSE，不暴露高权限数据库订阅。

## 项目文档

- [已确认设计](docs/superpowers/specs/2026-09-21-shared-daily-checkin-design.md)
- [实现计划与进度](docs/superpowers/plans/2026-09-21-shared-daily-checkin-plan.md)
- [开发说明](docs/development.md)

