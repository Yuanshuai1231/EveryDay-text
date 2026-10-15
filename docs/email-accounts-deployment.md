# 邮箱账号与空间管理

本项目以 Vercel + Supabase 为线上运行目标。提交代码后需先应用 Supabase 增量迁移，再触发 Vercel Production 部署。

入口改为邮箱注册/登录。账号验证后进入“我的空间”，可以创建、加入和切换多个小组。小组的创建者在“空间设置”中更改名称和动物头像。已有记录、成员 ID、聊天和创建者角色保持不变；旧浏览器身份可以在登录账号后点击“绑定已有空间”，将自己的原成员身份绑定到账号。

## 本地体验

运行 `pnpm dev --hostname 127.0.0.1`，打开 `http://127.0.0.1:3000`。

1. 点击“注册”，填写昵称、邮箱、密码和确认密码。
2. SMTP 模式下从邮箱读取 6 位验证码；默认 preview 模式点击“查看本地邮件预览”，读取本地验证码。
3. 在注册页面输入验证码，点击“验证并进入空间”。验证码有效期 10 分钟，每次重发需间隔 60 秒；新码发送成功后旧码失效。验证后进入“我的空间”，创建小组，或通过有效邀请码加入。
4. 创建者进入“空间设置”，修改名称、空间头像和首页主题。首页主视觉会展示当前小组前两位有效成员的动物头像。
5. 测试找回密码时，重置邮件也显示在同一个本地收件箱中。

默认本地模式使用持久化的邮件预览，不向真实邮箱发信；预览页面仅允许开发模式的本地回环地址访问。也可以按 [QQ SMTP 配置说明](qq-smtp-setup.md) 切换为真实发信。测试邮箱注册的账号仅属于本机数据库，不会自动上传到云端。

## 未来上线的数据库迁移

此前 `0001～0005` 已对齐。新增三份增量迁移按顺序执行：

- `20261013000100_accounts.sql`：账号、全局会话、一次性验证/重置令牌、旧成员账号关联。
- `20261013000200_account_spaces.sql`：空间头像、账号创建/加入/设置的事务函数。
- `20261013000300_email_verification_codes.sql`：验证码摘要、有效期、错误次数、重发冷却与一次性校验函数。
- `20261013001100_space_themes.sql`：空间主题字段与创建者主题更新函数。默认主题为 `growth-purple`，可选 `morning-cream`、`mint-blue`、`sunset-coral`。

不重跑旧迁移，不重建业务表。在线上 Supabase SQL Editor 或迁移流水线中按文件名顺序执行新增迁移，确认 `spaces.theme_id` 已存在且 PostgREST schema cache 已更新后，再发布依赖新结构的代码。

## Supabase 邮箱验证配置

线上模式使用 Supabase Auth 实际发验证邮件与找回密码邮件，需要以下设置：

1. Authentication → Sign In / Providers → Email：启用邮箱登录并开启 Confirm email。
2. URL Configuration：Site URL 设置为 `https://every-day-text.vercel.app`，允许重定向到该域名的 `/auth/confirm`。
3. Email Templates → Confirm signup：线上 Supabase 使用确认链接，不要使用默认的 `{{ .ConfirmationURL }}` 模板。请把正文改成直接携带一次性 `token_hash` 的链接，注册页面会提示用户点击邮件完成验证：

   ```html
   <h2>叮咚小组邮箱验证</h2>
   <p>请点击下面的按钮确认邮箱并完成注册：</p>
   <p>
     <a
       href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
       >确认邮箱</a
     >
   </p>
   <p>如果不是你本人操作，请忽略此邮件。</p>
   ```

4. Email Templates → Reset password 保留服务端一次性链接：

   ```html
   <a
     href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery"
     >设置新密码</a
   >
   ```

5. Authentication → SMTP Settings：为真实用户配置发信服务与发件邮箱。Supabase 默认邮件服务仅用于试用，并限制收件地址与频率；正式网站需要自定义 SMTP。不要在聊天或仓库中公开 SMTP 密码。
6. Vercel Production 推荐设置 `NEXT_PUBLIC_SITE_URL=https://every-day-text.vercel.app`，保留 `CHECKIN_STORAGE=supabase`、`NEXT_PUBLIC_SUPABASE_URL` 和服务端 `SUPABASE_SERVICE_ROLE_KEY`。如果暂时不设置，构建和回调会使用 Vercel 的 `VERCEL_PROJECT_PRODUCTION_URL` 或 `VERCEL_URL` 系统变量。

参考：[邮箱密码认证](https://supabase.com/docs/guides/auth/passwords)、[SMTP 设置](https://supabase.com/docs/guides/auth/auth-smtp)、[邮件模板](https://supabase.com/docs/guides/auth/auth-email-templates)。

## 身份与权限

已注册并验证过的邮箱再次注册或申请确认邮件时会提示直接登录，不发送新的注册邮件。未验证账号重复注册会保留首次设置的密码与昵称。本地账号模式继续使用 6 位验证码；Supabase 云端模式使用确认链接，发送频率和验证限流由 Supabase Auth 控制。修改模板后请使用新注册邮箱测试，旧邮件只能使用一次且可能已经过期。

旧用户需要保留原浏览器身份才能绑定已有空间，不能用昵称认领历史或创建者权限。新账号即使知道旧昵称，也不能绑定别人的成员。移除/退出一个小组不会删除邮箱账号或其他小组权限。密码找回需要验证邮件的一次性授权，完成后原账号会话失效，需要重新登录。
