# 开发

- 页面：app/(public) 为创建/加入；app/(space)/[spaceId] 为首页、打卡、任务、群聊/私聊、成员。
- 数据接口：app/api。每个写接口验证Origin和输入，每个受保护接口验证成员会话；从客户端传来的成员ID不能替代会话身份。
- 数据库：supabase/migrations。初始建表和RPC均可直接在Supabase执行；本地模式补齐角色与publication，并跳过不需要的pgcrypto扩展加载。
- lib/local/fetch.ts 是仅服务端的PostgREST子集适配器，复用Supabase客户端的query builder。标识符校验，值参数化，日期与时间戳保留原始精度。遇到未支持查询显式报错，不回落为成功。
- 本地数据库单实例惰性启动，首次请求建表；新增迁移后重启开发服务器。请不要让dev和production服务同时连接同一.data目录。
- 测试中的本地数据库用内存PGlite，实际执行SQL。端到端测试用独立创建的验收空间，体验数据库会保留这些测试空间；可通过CHECKIN_DATA_DIR使用单独的测试目录。
- 数据实时变化通过/api/spaces/[spaceId]/events发update/revoked事件，断线补拉；界面同时提供5秒刷新兜底。

~~~powershell
pnpm dev
pnpm test
pnpm exec playwright test
~~~

客户端组件不要导入 lib/supabase/server.ts。修改自动保存时必须验证“正在发送时继续输入”“草稿删除时继续输入”“恢复离线草稿”“409选择版本”，避免旧网络请求清掉新草稿。

