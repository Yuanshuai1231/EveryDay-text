# QQ 邮箱发送真实验证邮件

当前本地账号数据库仍为 PGlite。只切换邮件发送方式，不迁移账号，也不修改线上 Supabase。

## 本机配置

QQ 邮箱网页版 → 右上角头像 → 设置 → 账号与安全 → 安全设置，开启 SMTP 服务并生成授权码。需要由邮箱持有人完成 QQ 安全验证。使用授权码作为 SMTP 密码，不使用 QQ 登录密码。

在项目根目录 `.env.local` 中配置：

```dotenv
CHECKIN_STORAGE=local
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
CHECKIN_MAIL_TRANSPORT=smtp
MAIL_SMTP_HOST=smtp.qq.com
MAIL_SMTP_PORT=465
MAIL_SMTP_SECURE=true
MAIL_SMTP_USER=你的邮箱@qq.com
MAIL_FROM=你的邮箱@qq.com
MAIL_SMTP_PASSWORD=在本机填写授权码
```

`MAIL_FROM` 和登录邮箱保持一致。配置文件已被 Git 忽略，不要将授权码粘贴到聊天、截图或仓库中。保存后重启本地开发服务。

## 检查与使用

运行 `pnpm mail:check` 验证服务器连接、TLS 与身份认证，不会发送邮件。成功后注册新邮箱，或在未验证账号的页面点击“发送验证码”。邮件正文包含 6 位数字，回到注册页面输入后完成验证。验证码 10 分钟有效、最多 5 次错误，每次重发间隔 60 秒。最终到达收件箱仍受邮箱服务的投递、垃圾邮件与限流规则影响。

已经注册并验证的邮箱应直接登录，再次注册不会发送验证码。需要找回密码时使用登录页的“忘记密码”。

默认的 `CHECKIN_MAIL_TRANSPORT=preview` 只生成本机收件箱邮件。未配置 SMTP 授权码时，smtp 模式会明确报错，不会改用预览并伪报已发送。smtp 模式不保存含验证码或验证令牌的本地预览邮件。

## 以后上线

Supabase Auth 模式由 Supabase 发送认证邮件，SMTP 配置需要填写在 Supabase Authentication 的 SMTP Settings 中；本机 `MAIL_SMTP_*` 配置只控制本地账号模式，不能自动代替 Supabase 的发信设置。线上 SMTP 或验证回调变更需要单独配置和验证。

参考：[QQ 授权码官方说明](https://help.mail.qq.com/detail/106/985)、[Nodemailer SMTP](https://nodemailer.com/smtp)。
