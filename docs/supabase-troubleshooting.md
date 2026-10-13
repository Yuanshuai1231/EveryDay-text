# Supabase 创建 / 加入空间排查

目标：[Supabase 项目 khvpwwwaxitejdqlkoia](https://supabase.com/dashboard/project/khvpwwwaxitejdqlkoia)，线上站点：[每日打卡](https://every-day-text.vercel.app)。

## 先运行只读诊断

在该项目的 [SQL Editor](https://supabase.com/dashboard/project/khvpwwwaxitejdqlkoia/sql/new) 中，粘贴并完整运行 [check_setup.sql](../supabase/diagnostics/check_setup.sql)。查看各个结果集：

- `service_role_exists`、`service_role_bypasses_rls`、`service_role_public_usage` 应为 `true`。
- 9 张表的 `table_exists`、`rls_enabled` 和服务端访问权限应为 `true`。
- 12 个函数的 `function_exists`、`argument_names_match`、`service_role_execute` 应为 `true`。5 个 RPC 和 3 个授权辅助函数的 `security_definer` 应为 `true`；校验、触发器函数为 `false` 是正常的。
- 5 个触发器的存在、启用和函数匹配检查应为 `true`。

诊断不读取业务记录或密钥。`database_name` / `schema_name` 用于确认当前 SQL 执行环境；SQL 的 `session_timezone` 不能判断数据库的物理区域，区域请查看该项目的设置页面。诊断全绿也不能证明 Vercel 正在使用同一项目、正确密钥或最新部署。

## 按现状补齐迁移

全新、确认没有业务表的数据库，在 SQL Editor 按顺序完整执行，每一步成功后再执行下一步：

1. [0001_core_schema.sql](../supabase/migrations/0001_core_schema.sql)：9 张表、创建/加入 RPC、权限和基础触发器。
2. [0002_membership_operations.sql](../supabase/migrations/0002_membership_operations.sql)：邀请码唯一索引、移除成员与转让空间 RPC。
3. [0003_chat_rpc.sql](../supabase/migrations/0003_chat_rpc.sql)：私聊 RPC。
4. [0004_active_write_guard.sql](../supabase/migrations/0004_active_write_guard.sql)：日志、打卡和任务的成员状态触发器。

已有任何业务表时，**不要重跑 0001，不要删表重建**。这些脚本并非全部可重复执行；应结合诊断与原执行记录，仅补齐确认尚未执行的迁移。若 0001 只执行了一部分，先备份并逐项修复缺失对象；不要以“表已存在”为由跳过剩余错误。通过 SQL Editor 手工执行不一定有 Supabase CLI 的迁移历史记录。

迁移全部成功后重新运行诊断。只有对象已存在、但 Data API 仍报找不到函数或表时，再刷新 [PostgREST 结构缓存](https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema)：

```sql
NOTIFY pgrst, 'reload schema';
```

## 核对 Vercel Production 并重新部署

Vercel 项目 → Settings → Environment Variables，确认以下变量属于 **Production**，值来自上面的同一个 Supabase 项目：

| 变量名 | 值 |
| --- | --- |
| `CHECKIN_STORAGE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://khvpwwwaxitejdqlkoia.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 该项目的服务端 `service_role` 密钥；不要填 anon / publishable key |

当前创建、加入流程不依赖 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。服务端密钥不能放进任何 `NEXT_PUBLIC_` 变量或分享给他人。保存后到 Deployments 对 Production 执行 **Redeploy**，等新部署成功，再测试线上创建与加入。[环境变量修改仅应用于新部署](https://vercel.com/docs/environment-variables)。

## 按实际日志分类

在 Vercel Runtime Logs 查找 `POST /api/spaces` 或 `POST /api/spaces/join`，对应日志标记为 `space creation failed` / `space join failed`。加入接口可能把数据库故障也显示成“邀请码无效或已失效”，需要看日志里的错误码。

| 日志错误 | 优先检查 |
| --- | --- |
| “请配置 Supabase URL 和服务端密钥” | Production 的变量名、是否为空、是否已 Redeploy |
| `Invalid API key`、HTTP 401、JWT 验证错误 | 服务端密钥是否有效，URL 与密钥是否来自同一个项目 |
| `PGRST202`、`42883`、找不到函数 | 函数与参数签名、对应迁移；对象正确后刷新缓存 |
| `PGRST205`、`42P01`、找不到表 | 业务表与目标项目是否正确、0001 是否完整执行 |
| `42501`、`permission denied` | 实际使用的密钥角色、schema/table/function 权限；勿关闭 RLS 作为修复 |
| `PGRST002`、HTTP 503、连接失败 / 超时 | 项目是否暂停、Data API 是否启用并暴露 `public`，数据库和 API 服务状态 |
| `P0001: invalid invite` | 邀请码确实无效或已撤销，请使用当前邀请码 |
| `23505` | 看具体约束；加入时可能是同空间昵称重复 |
| `P0002: group conversation missing` | 空间的群会话数据异常；备份后修复，勿重跑初始化 |

分享排查结果时提供错误码、错误信息和上述元数据检查结果即可；不要分享 API key、Cookie、令牌或请求头。全部通过后，用创建时的浏览器保留空间身份，再用另一浏览器及新的昵称测试加入。
