# 部署与数据保存

## 单实例 Node 服务

默认本地模式使用 PGlite PostgreSQL，适合本机、局域网和小团队单实例自托管。数据存于 .data/postgres；可以用 CHECKIN_DATA_DIR 指向绝对路径的持久磁盘目录。每个数据库目录同时只能有一个应用进程。停止服务后整体备份该目录，恢复时停服替换备份。切换数据库模式不会自动搬迁数据。

生产构建：pnpm build，然后 pnpm start。公网使用 HTTPS 反向代理（例如 Caddy/Nginx）并将流式接口的代理缓冲关闭。生产 Cookie 要求 HTTPS。默认 preview 邮件仅供开发，生产环境禁用该预览；单实例本地数据库模式可按 [QQ SMTP 配置](qq-smtp-setup.md) 切换真实发信，Supabase 模式则在 Supabase Auth 配置 SMTP。开发体验手机/平板时，使用本地预览的用户先在电脑本机回环地址完成验证，再在信任的局域网开放 pnpm dev --hostname 0.0.0.0。

本地模式不支持无服务器临时磁盘、多副本并发写同一个目录。增加实例前切换 Supabase。

## Supabase 模式

1. 创建 Supabase 项目，在 SQL 编辑器中按文件名顺序执行 supabase/migrations/*.sql。
2. 复制 .env.example 为 .env.local，填 CHECKIN_STORAGE=supabase、NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY。旧 anon key 变量只为预留配置，当前浏览器不直读数据库。
3. 重启服务并创建一个新的测试空间，确认创建、加入、任务、私聊和移除成员流程。
4. 在支持 Next.js 的 Node 主机上部署，并给反向代理配置 HTTPS 和 SSE 不缓存。服务端2秒检查一次当前成员有权访问的数据，连接到期可自动重连。

不要把 service-role key 放在 NEXT_PUBLIC_ 变量里，也不要提交 .env.local。环境检查脚本只报告缺少哪些变量，不打印值。

## 身份与权限边界

登录使用经过验证的邮箱和密码，256位随机账号会话令牌仅在 HttpOnly、SameSite=Lax Cookie 中，数据库仅保存SHA256摘要，默认30天过期。账号可以通过密码登录恢复组内身份；旧匿名成员需持有原浏览器令牌才能显式绑定。具体邮箱验证、找回及迁移步骤见 [邮箱账号部署说明](email-accounts-deployment.md)。

邀请码为8位随机大写字母数字，数据库保存唯一摘要；轮换后旧码立即失效，新成员可以查看小组历史。成员离开后保留既有日志、任务和消息，旧会话无法继续访问。私聊仅双方可见（同空间其他人无权读取）。

RLS对浏览器直接使用anon/authenticated读写业务表默认拒绝。服务端检查Cookie、当前成员状态、空间、任务所有权/会话参与者后才使用service-role client。自定义Cookie不会被Supabase auth.uid()自动识别；不应将浏览器直连Realtime改成service-role连接。

当前使用SSE而非浏览器直连Supabase Realtime，以统一两种存储模式并确保每次推送前重新确认成员权限。事件只通知刷新，不包含聊天正文，客户端重新调用权限检查后的API获取内容。已下载或截屏的内容无法撤回。

请求限流目前为单进程固定窗口；多实例部署需要共享限流存储。附件、语音、公开社区和手机号登录暂未实现。

技术参考：[PGlite持久化](https://pglite.dev/docs/filesystems)、[Supabase实时授权](https://supabase.com/docs/guides/realtime/authorization)。

