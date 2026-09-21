# 多人每日打卡网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 构建一个支持私密小组、上午/下午打卡、共享任务、群聊与私聊，并适配手机、平板和桌面的卡通风格网站。

**Architecture:** 使用 Next.js App Router + TypeScript 构建界面和服务端 API；Supabase PostgreSQL 保存数据并用 RLS 做空间隔离；Supabase Realtime 推送可访问空间和会话的变化。轻量身份由服务端生成随机成员令牌，数据库只保存令牌哈希，原始令牌只放在 HttpOnly Cookie 中。浏览器 IndexedDB 保存未提交的打卡草稿。

**Tech Stack:** Next.js、React、TypeScript、Tailwind CSS、Vitest、Playwright、Supabase JS/SSR、Supabase PostgreSQL/RLS/Realtime、IndexedDB。

---

## 文件边界

- app/'(public)'/：创建空间、邀请码加入。
- app/'(space)'/[spaceId]/：空间壳层、首页、打卡、任务、聊天、成员。
- components/：导航、卡片、编辑器、列表、聊天和状态组件。
- lib/auth/：输入校验、邀请码/令牌、Cookie 会话和授权。
- lib/data/：打卡、任务、会话和消息的数据访问。
- lib/realtime/：空间与会话订阅、重连补拉。
- lib/offline/：IndexedDB 草稿和消息发送状态。
- app/api/：所有服务端写入口；每个写入口二次验证成员身份和资源所有权。
- supabase/migrations/：表、索引、RLS 和 Realtime publication。
- tests/unit/、tests/integration/、tests/e2e/：纯函数、API/RLS、三种视口流程。

### Task 1: 初始化 Next.js 应用和质量门禁

**Files:**
- Create: package.json, tsconfig.json, next.config.ts, tailwind.config.ts, postcss.config.mjs
- Create: app/layout.tsx, app/globals.css, vitest.config.ts, playwright.config.ts, .env.example
- Create: tests/unit/smoke.test.ts

- [ ] **Step 1: 生成应用骨架**

运行：

~~~powershell
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm
npm install @supabase/ssr @supabase/supabase-js zod lucide-react
npm install -D vitest @vitejs/plugin-react jsdom @playwright/test
~~~

确认 npm run dev 可打开页面，npm run build 成功。

- [ ] **Step 2: 配置脚本和环境变量**

在 package.json 设置：

~~~json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
~~~

.env.example 包含 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY；服务端只能读取 service role key，客户端只能读取两个公开变量。

- [ ] **Step 3: 写冒烟测试并提交**

tests/unit/smoke.test.ts：

~~~ts
import { describe, expect, it } from "vitest";
describe("project setup", () => {
  it("runs the test harness", () => expect(true).toBe(true));
});
~~~

运行 npm test -- --run tests/unit/smoke.test.ts，预期 1 passed，然后：

~~~powershell
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts app tests .env.example vitest.config.ts playwright.config.ts
git commit -m "chore: initialize next app and test tooling"
~~~

### Task 2: 建立数据模型、RLS 和 Realtime 授权边界

**Files:**
- Create: supabase/config.toml, supabase/migrations/0001_core_schema.sql, supabase/seed.sql
- Create: lib/supabase/server.ts, lib/supabase/browser.ts, lib/supabase/types.ts
- Create: tests/integration/rls.test.ts

- [ ] **Step 1: 写核心表和约束**

迁移创建 spaces、members、member_sessions、daily_logs、daily_checkins、tasks、conversations、conversation_members、messages。使用 removed_at 保留成员历史；daily_logs 唯一键为 (space_id, member_id, work_date, slot)；打卡唯一键为 (space_id, member_id, work_date)；私聊以规范化的 direct_member_low/high 唯一；消息唯一键为 (conversation_id, sender_id, client_message_id)。限制 slot 为 morning/afternoon，会话类型为 group/direct。

- [ ] **Step 2: 锁定会话与 RLS 方案**

服务端通过 HttpOnly 成员 Cookie 查出 active session，再使用 service role 执行已经完成的成员/资源授权检查；service role 永不下发浏览器。客户端读操作使用受 RLS 保护的 Supabase client，并在服务端 API 返回前再次检查 active membership。创建 SQL 辅助函数 is_active_member(space_id) 与 can_read_conversation(conversation_id)，所有业务表启用 RLS。私聊只允许双方读取，任务只有 creator 能写，removed member 不能读写。

- [ ] **Step 3: 配置 Realtime 和集成矩阵**

将日志、打卡、任务、成员和消息加入 Realtime publication；频道服务端按 active membership 签发/验证，移除成员时广播变更并关闭其频道。seed.sql 建一个演示空间、群聊和两名成员。测试覆盖 A/B 两空间、active/removed 四种身份的 query、mutation、realtime 隔离；没有本地 Supabase 时明确跳过并输出原因。

- [ ] **Step 4: 验证并提交**

运行 supabase db reset 和 npm test -- --run tests/integration/rls.test.ts。预期跨空间、他人任务、私聊第三人、removed member 全部拒绝，然后：

~~~powershell
git add supabase lib/supabase tests/integration/rls.test.ts
git commit -m "feat: add schema row security and realtime publication"
~~~

### Task 3: 实现昵称、邀请码和浏览器会话

**Files:**
- Create: lib/auth/token.ts, lib/auth/validation.ts, lib/auth/session.ts, lib/auth/rate-limit.ts
- Create: app/api/spaces/route.ts, app/api/spaces/join/route.ts, app/api/spaces/[spaceId]/invite/route.ts
- Create: app/'(public)'/page.tsx, app/'(public)'/join/page.tsx
- Test: tests/unit/auth.test.ts, tests/integration/space-api.test.ts

- [ ] **Step 1: 先写失败测试**

用 Vitest 覆盖：昵称 trim 后为 1–24 个 Unicode 字符；空间名 1–48 字符；HTML/control 字符拒绝或按纯文本处理；邀请码为 8 位大写字母/数字；原始令牌至少 128 bit；同一令牌摘要稳定且数据库不保存原文。明确同一空间昵称不得重复，removed 成员昵称释放后才可重新加入。

- [ ] **Step 2: 实现创建空间原子事务**

POST /api/spaces 在一个事务中创建 space、creator member、默认 group conversation 和 session；邀请码冲突时重新生成，数据库只存 SHA-256 摘要。成功响应只返回一次原始邀请码，设置 daily_member_session Cookie（HttpOnly、SameSite=Lax、生产 Secure、合理过期时间）。失败回滚，不留下孤儿成员或会话。

- [ ] **Step 3: 实现加入、撤销和限流**

POST /api/spaces/join 对邀请码错误、已撤销、空间不存在和空间已满返回统一可读错误，错误时不创建成员；同一 IP+邀请码 5 分钟最多 20 次。POST /api/spaces/[spaceId]/invite 仅创建者可调用：撤销旧摘要、生成新码并只显示一次。加入事务锁定空间并检查 active membership，处理并发加入。

- [ ] **Step 4: 实现会话读取、退出和移除**

会话服务从 Cookie 计算摘要，拒绝 revoked/过期 session；退出或移除写 revoked_at/removed_at、清 Cookie，并让后续 API 和 Realtime 立即返回 401/403。创建者不能移除自己；空间创建者退出时先转移创建者身份或要求解散空间，首版选择“创建者必须先转移给另一名 active member 才能退出”。

- [ ] **Step 5: 运行测试并提交**

~~~powershell
npm test -- --run tests/unit/auth.test.ts tests/integration/space-api.test.ts
git add lib/auth app/api/spaces app/'(public)' tests/unit/auth.test.ts tests/integration/space-api.test.ts
git commit -m "feat: add invite based member sessions"
~~~


### Task 4: 实现上午/下午打卡、自动保存和冲突恢复

**Files:**
- Create: lib/data/checkins.ts, lib/offline/drafts.ts
- Create: app/api/spaces/[spaceId]/logs/route.ts, app/api/spaces/[spaceId]/checkins/route.ts
- Create: components/checkin/LogEditor.tsx, components/checkin/CheckinStatus.tsx
- Create: app/'(space)'/[spaceId]/checkin/page.tsx
- Test: tests/unit/drafts.test.ts, tests/integration/checkin-api.test.ts

- [ ] **Step 1: 写草稿和日期测试**

IndexedDB key 固定为 spaceId:memberId:workDate:slot，测试上午/下午、今天/历史日期互不覆盖。日期由空间 IANA 时区在服务端解析，跨午夜不会串日；服务端拒绝非法日期和 slot。

- [ ] **Step 2: 实现日志和完成打卡 API**

GET /logs?date=YYYY-MM-DD 返回该空间日期下所有成员两种时段记录；PUT /logs 用唯一键 upsert，仅当前成员可写。PUT /checkins 用成员+日期 upsert 完成时间；完成状态不检查任务数量，允许后续修改日志和重复点击。

- [ ] **Step 3: 接入本地草稿、自动保存和重试**

输入后 600ms 防抖写 IndexedDB 并调用 API，显示保存中/已保存/保存失败。断网保留文本；重连按 1、2、4、8 秒最多四次重试，使用 editedAt 条件写。服务端发现远端版本更新时返回 409 和两个版本，界面让用户选择保留本地或远端，不静默覆盖。

- [ ] **Step 4: 实现“完成打卡”和验证**

点击按钮调用完成接口并显示完成时间；刷新、断网重连、重复点击、历史补写、跨午夜和网络失败均有测试。运行：

~~~powershell
npm test -- --run tests/unit/drafts.test.ts tests/integration/checkin-api.test.ts
git add lib/data/checkins.ts lib/offline/drafts.ts app/api/spaces components/checkin app/'(space)' tests
git commit -m "feat: add morning afternoon check-ins"
~~~

### Task 5: 实现共享任务和所有权

**Files:**
- Create: lib/data/tasks.ts
- Create: app/api/spaces/[spaceId]/tasks/route.ts, app/api/spaces/[spaceId]/tasks/[taskId]/route.ts
- Create: components/tasks/TaskList.tsx, components/tasks/TaskComposer.tsx
- Create: app/'(space)'/[spaceId]/tasks/page.tsx
- Test: tests/integration/tasks-api.test.ts

- [ ] **Step 1: 写权限测试**

覆盖创建者创建、所有成员读取、创建者修改/勾选/删除、他人只读、直接 HTTP 越权被拒绝、未加入成员拒绝；并发更新使用 updated_at 条件写返回 409。

- [ ] **Step 2: 实现服务端 API**

标题 1–120 字符、备注最多 1,000 字符、目标日期为合法空间日期；写操作检查 active membership 和 creator_id。未完成任务留在原日期，不自动复制或消失；所有查询强制带当前 space_id。

- [ ] **Step 3: 实现 UI**

本人任务渲染可操作复选框、编辑和删除；他人任务渲染只读状态，不渲染可提交复选框。手机端创建按钮固定右下角并避开 safe area，平板/桌面放在列表标题区。

- [ ] **Step 4: 测试并提交**

运行 npm test -- --run tests/integration/tasks-api.test.ts，预期 ownership/RLS 场景通过，然后：

~~~powershell
git add lib/data/tasks.ts app/api/spaces components/tasks app/'(space)' tests/integration/tasks-api.test.ts
git commit -m "feat: add shared task list with ownership"
~~~

### Task 6: 实现群聊、私聊、分页和幂等重试

**Files:**
- Create: lib/data/conversations.ts, lib/data/messages.ts
- Create: app/api/spaces/[spaceId]/conversations/route.ts, app/api/conversations/[conversationId]/messages/route.ts
- Create: components/chat/ConversationList.tsx, components/chat/MessageList.tsx, components/chat/MessageComposer.tsx
- Create: app/'(space)'/[spaceId]/chat/page.tsx
- Test: tests/unit/message-state.test.ts, tests/integration/chat-api.test.ts

- [ ] **Step 1: 写消息状态和幂等测试**

消息状态为 sending → sent 或 sending → failed；相同 conversationId/senderId/clientMessageId 重试返回原消息。若重放正文、发送者或会话不一致返回冲突；游标 serverCreatedAt/id 分页不重复、不遗漏。

- [ ] **Step 2: 实现会话和消息 API**

空间初始化已有唯一群聊；创建私聊时按成员 ID 字典序写 low/high，数据库唯一索引处理并发。消息正文限制 1–2,000 字符、拒绝空白；历史按游标分页，服务端时间相同时用 id tie-breaker。

- [ ] **Step 3: 实现聊天 UI**

发送生成 UUID clientMessageId，立即显示发送中气泡；确认后替换为服务端消息，失败保留正文和重试按钮。上拉加载旧消息；用户不在底部时新消息显示“有新消息”，不强制滚底。手机为全屏会话，平板为消息区+成员列表双栏。

- [ ] **Step 4: 测试并提交**

运行 npm test -- --run tests/unit/message-state.test.ts tests/integration/chat-api.test.ts，然后：

~~~powershell
git add lib/data/conversations.ts lib/data/messages.ts app/api/conversations app/api/spaces components/chat app/'(space)' tests
git commit -m "feat: add group and direct messaging"
~~~

### Task 7: 接入 Realtime、断线补拉和成员管理

**Files:**
- Create: lib/realtime/useSpaceRealtime.ts, lib/realtime/useConversationRealtime.ts, lib/realtime/reconcile.ts
- Create: app/api/spaces/[spaceId]/members/[memberId]/route.ts
- Modify: components/tasks/TaskList.tsx, components/checkin/CheckinStatus.tsx, components/chat/MessageList.tsx
- Test: tests/integration/realtime.test.ts

- [ ] **Step 1: 写实时隔离和补拉测试**

验证只订阅 active membership 可访问的空间/会话；事件丢失或断线后按最后 cursor 拉取 snapshot，合并时按主键去重；任务、日志、打卡、成员、消息事件更新对应缓存；removed member 连接关闭且不再收到事件。

- [ ] **Step 2: 实现订阅 hooks**

频道命名 space:spaceId、conversation:conversationId；收到 postgres change 后按主键合并。重连先取消旧频道，按最后消息 cursor/API snapshot 补拉，再恢复订阅；权限错误清空缓存并跳转加入页。组件卸载取消订阅。

- [ ] **Step 3: 实现成员管理**

创建者只能移除其他 active member，普通成员只能退出自己；服务端事务写 removed_at/revoked_at、移除 conversation_members、广播 member.changed 并关闭频道；历史日志/任务/消息不删除。

- [ ] **Step 4: 测试并提交**

运行 npm test -- --run tests/integration/realtime.test.ts，确认断线补拉最终状态无重复，然后：

~~~powershell
git add lib/realtime app/api/spaces components tests/integration/realtime.test.ts
git commit -m "feat: add realtime reconciliation and member management"
~~~


### Task 8: 完成卡通视觉、空间导航和三端响应式

**Files:**
- Create: components/layout/SpaceSidebar.tsx, components/layout/TabletSidebar.tsx, components/layout/MobileBottomNav.tsx
- Create: components/ui/AnimalAvatar.tsx, components/ui/EmptyState.tsx, components/ui/SaveStatus.tsx
- Modify: app/globals.css, app/'(space)'/[spaceId]/layout.tsx, all space pages
- Test: tests/e2e/responsive.spec.ts

- [ ] **Step 1: 定义设计 tokens**

在 app/globals.css 定义暖米白、深紫、黄色主按钮、珊瑚/浅蓝辅助色、圆角、阴影、最大内容宽度和 env(safe-area-inset-*)。所有可点击控件最小 44×44px，焦点状态可见。

- [ ] **Step 2: 实现断点导航**

<768px 使用底部导航和单列；768–1023px 使用可收起侧栏和双栏；>=1024px 使用完整侧栏、卡片网格和最大宽度。导航保持相同 URL/状态；侧栏键盘可达，手机 FAB 不遮挡输入或 bottom nav。

- [ ] **Step 3: 写三端 E2E**

使用 375×812 手机竖屏、768×1024 平板竖屏、1024×768 平板横屏、1366×900 桌面，验证加入、今日打卡、任务勾选、群聊发送、私聊打开；断言无横向溢出、底部导航/软键盘安全区、侧栏显示规则、聊天新消息提示和上拉分页。

- [ ] **Step 4: 测试并提交**

~~~powershell
npm run test:e2e -- tests/e2e/responsive.spec.ts
git add app components tests/e2e/responsive.spec.ts
git commit -m "feat: add cartoon responsive space layout"
~~~

### Task 9: 首页摘要、成员页面和错误状态

**Files:**
- Create: lib/data/space-summary.ts, components/space/MemberProgress.tsx, components/space/RecentActivity.tsx
- Modify: app/'(space)'/[spaceId]/page.tsx, app/'(space)'/[spaceId]/members/page.tsx
- Create: app/error.tsx, app/not-found.tsx
- Test: tests/integration/summary.test.ts

- [ ] **Step 1: 实现首页摘要**

按空间 IANA 时区查询当天成员完成打卡数、任务完成数和最近动态；两段日志不计作任务完成数；所有查询强制带 space_id 和 active membership。

- [ ] **Step 2: 实现成员页面**

显示昵称、头像颜色、加入时间和当天状态；创建者可重新生成一次性邀请码并执行移除，普通成员退出。复制成功显示短提示，不把邀请码放入 URL。

- [ ] **Step 3: 实现空状态和错误页**

为无任务、无消息、网络失败、无权限和空间不存在提供卡通空状态；错误页提供重试，权限失效清理缓存并跳转加入页。运行 npm test -- --run tests/integration/summary.test.ts 后提交：

~~~powershell
git add app lib/data/space-summary.ts components/space tests/integration/summary.test.ts
git commit -m "feat: add space dashboard and member states"
~~~

### Task 10: 文档、环境检查和全量验证

**Files:**
- Create: README.md, docs/development.md, docs/deployment.md, scripts/check-env.mjs
- Modify: package.json, playwright.config.ts

- [ ] **Step 1: 写环境检查**

scripts/check-env.mjs 只输出三个必需变量的存在/缺失状态，不输出值；缺失时退出码 1。

- [ ] **Step 2: 写开发和部署文档**

README 说明安装、.env.local、supabase start、迁移、种子和测试命令；部署文档说明 Supabase 项目、RLS、Realtime publication、Next.js 环境变量和 HTTPS Cookie 要求。

- [ ] **Step 3: 运行质量门禁**

~~~powershell
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
~~~

预期 lint、单元/集成测试、生产构建和四种视口 E2E 通过；没有 Supabase 连接时集成测试必须明确标记环境跳过。

- [ ] **Step 4: 自检并提交**

检查设计文档第 2、4、6、7、8 节逐项有实现和测试；确认没有密钥、.superpowers/、.next/、node_modules/ 被跟踪：

~~~powershell
git status --short
git add README.md docs scripts package.json playwright.config.ts
git commit -m "docs: add development and deployment instructions"
~~~

## 验收顺序

1. Task 1–3：创建空间、错误邀请码、会话、退出和邀请码轮换。
2. Task 4–6：打卡、任务、群聊、私聊的独立 API 和 UI。
3. Task 7：实时同步、断线补拉、移除成员和撤销订阅。
4. Task 8–9：手机、平板、桌面布局与首页/成员流程。
5. Task 10：全量质量门禁通过后才标记为可部署版本。

## 计划自检

- 覆盖昵称+邀请码、一次性邀请码摘要、Cookie 会话、RLS/Realtime 授权、上午/下午日志、完成打卡、任务所有权、群聊/私聊、幂等消息、断线草稿/补拉、成员移除、手机/平板/桌面响应式。
- 明确了创建空间原子事务、并发加入和私聊竞态、条件写冲突、重连游标去重、XSS/长度校验、服务端二次授权。
- 计划中没有 TODO、TBD、待定 或“稍后补充”等未决占位。


