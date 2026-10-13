# 删除与退出空间实现计划

**Goal:** 完成原聊天未完成的空间删除、成员退出及清单验收。

**Architecture:** 复用现有成员会话鉴权和移除函数，新增删除空间事务与共用按钮组件。沿用当前本地工作目录和未提交修改。

**Tech Stack:** Next.js 16.3.5、React、PostgreSQL/PGlite、Vitest。

- [x] 在 tests/integration/space-lifecycle.test.ts 验证创建者删除、成员退出、来源与身份、循环外键、级联数据、账号会话、其他空间及权限；先运行观察功能缺失失败。
- [x] 新增 20261013000600_space_lifecycle.sql；DELETE 空间接口与 POST leave 接口；补 RPC 类型及本地标量转换。运行生命周期集成测试。
- [x] 在 tests/unit/account-ui.test.tsx 添加卡片操作测试，验证确认取消与失败保留卡片，先观察失败；共用 SpaceMembershipActions 用于列表与设置页。
- [x] 验证设置入口及成功返回列表，完善部署说明；运行全量测试、lint、类型、生产构建和隔离 HTTP 验收。
- [x] 备份本地数据库并启动开发服务，核对迁移记录和页面接口；只读审查后记录最终验收结果。
