# 邮箱验证码实现计划

**Goal:** 注册使用邮箱收到的数字验证码，输入正确后建立账号会话；已有验证账号明确引导登录。

**Architecture:** 本地验证码以 pending/delivered/used 状态与数据库行锁实现；继续使用统一 SMTP/preview 发送模块。线上接入 Supabase verifyOtp 并提供模板部署说明。前后端契约见同日邮箱验证码设计。

**Tech Stack:** Next.js 16.3.5、PGlite/PostgreSQL、Supabase Auth、Nodemailer、Vitest/Testing Library。

- [x] 后端先编写失败的生命周期测试；添加增量迁移、验证码模块、verify-email 路由并调整注册/重发；通过针对性测试。
- [x] 前端先编写失败的输入与验证/冷却/错误/已有账号测试；改为验证码输入界面并保留邮箱密码注册与登录；通过组件测试。
- [x] 更新本地邮件预览、端到端测试辅助与 QQ/Supabase 部署说明；只允许测试脚本使用 preview。
- [x] 独立审查认证安全与会话、执行全量测试/lint/类型/构建并恢复本地预览。
- [ ] 通过已授权邮箱进行一次真实验证码发信检查。若账号已验证，保留账号和小组数据，使用隔离测试库验收邮件，不改变其账号验证状态。

## 2026-10-13 验收结果

全量 27 个测试文件、300 项测试通过；eslint、TypeScript、Next.js 生产构建与 diff --check 通过。独立审查认证/验证码/界面 90 项通过。真实运行的本地 verify-email 接口拒绝无效码（400 INVALID_CODE），SMTP 模式禁用预览收件箱（404）。原数据库已备份，增量迁移已由本地数据库自动加载，服务运行于 http://127.0.0.1:3000。

真实 SMTP 验收脚本已在忽略的 `.superpowers/email-code/live-check.ts` 准备好，限制收件人为用户已授权的邮箱，只使用隔离数据库，不输出验证码或 SMTP 授权码。两次申请网络执行均因自动审批服务返回 503 Service Unavailable 未能执行；不是 SMTP 发送的结果，也没有以其他路径绕过审批。此项等待服务恢复或用户在自己的终端运行验收。
