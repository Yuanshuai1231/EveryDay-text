# 邮箱验证码验证

用户已明确要求把注册邮箱验证改为收到数字验证码后在页面输入完成验证，沿用已授权的 QQ SMTP、本地账号数据库和已有邮箱密码登录。本次仅修改本地项目。

## 用户流程

注册发送 6 位验证码；页面显示邮箱、验证码输入框、验证并进入空间按钮与重发倒计时。正确验证码直接创建账号会话并进入空间。未验证账号登录时提供同一验证码入口，重发后方显示发送状态。已验证邮箱重复注册或重发提示“此邮箱已注册并验证，请直接登录”，不显示发信成功。

验证码 10 分钟内有效，每个挑战最多允许 5 次错误，成功后不能复用。重发间隔 60 秒。SMTP 错误明确提示；新码发送失败不会废弃上一个仍有效的验证码。只有邮件服务接受发送后才能启用新码。密码与昵称不会因重复注册被覆盖。

## 服务契约

- 注册和重发成功：`requiresVerification:true, verificationMethod:"code", expiresIn:600, resendAfter:60, mailDelivery:"smtp"|"preview"|"supabase"`。仅 preview 允许 devMailUrl。
- 已注册并验证：HTTP 409，`error.code:"ACCOUNT_EXISTS"`，中文提示直接登录。
- 冷却期：HTTP 429，`error.code:"RATE_LIMITED"`，`retryAfter` 和 Retry-After 标头包含剩余秒数。
- 验证：POST `/api/auth/verify-email`，JSON `{email,code}`。成功返回 `{user,spaceId:null}`、HttpOnly SameSite 会话 Cookie、no-store。无效/过期/次数耗尽返回 HTTP 400 `INVALID_CODE`，不泄露验证码。拒绝跨源请求。

## 实现与兼容

本地增加仅 service_role 可用的验证码表及数据库原子操作：保留发送前 pending 状态、发送失败释放挑战、发送成功切换有效码、行锁下校验并计次。只存带随机挑战 ID 的验证码摘要。旧链接继续可用以兼容已经发出的邮件，密码找回链接保持已有流程。

Supabase 模式调用官方 `verifyOtp({email,token:code,type:"email"})`。部署前将 Confirm signup 模板改为包含 `{{ .Token }}`，并设置 OTP 有效期 600 秒与 SMTP。现阶段不修改云配置。

## 验证

覆盖正确/错误/过期/重放/错误次数上限/跨邮箱/重发冷却/新码替代/SMTP 失败和保留旧码/已验证账号重复注册、Supabase 码校验、输入与重发 UI。运行全量测试、lint、类型与构建；真实邮件只发用户授权的邮箱，不在日志或 API 输出验证码、密码或 SMTP 授权码。

官方依据：https://supabase.com/docs/guides/auth/auth-email-templates 与 https://supabase.com/docs/reference/javascript/auth-verifyotp。
