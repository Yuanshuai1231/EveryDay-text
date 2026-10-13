# 个人清单与小组目标实现计划

**Goal:** 每日打卡和小组目标分开，小组可按成员创建目标。

**Architecture:** 增量任务分类和负责人字段，沿用日期投影及任务事务；UI按分类筛选，鉴权区分内容创建者与完成负责人。

**Tech Stack:** Next.js 16.3.5、React、PostgreSQL/PGlite、Vitest。

- [ ] 后端：先增加 group-task-assignment 集成测试并确认失败；新增008迁移，调整RPC、类型、tasks服务与GET筛选，验证任务类型、归属和成员锁。
- [ ] 前端：先增加分离/成员选择与权限交互测试并确认失败；TaskChecklist支持scope及成员筛选，TaskBoard为group、Checkin为personal，卡片负责人和作者分权。
- [ ] 概览与摘要：本人personal预览、group统计/待办/目标预览，个人组内记录不混group，更新现有用例。
- [ ] 集成审查：运行全量测试、类型、lint与生产构建，修复真实问题；备份数据库后迁移与隔离HTTP验收，恢复本地服务。
- [ ] 更新部署说明和验收记录，保留本地修改。
