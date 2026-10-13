# 物品空间图标与提醒清单

用户明确要求空间头像和用户动物头像分离、日历美化、每日记录取消上午/下午、逐条勾选完成、添加时选择仅一次或每天。用户补充：一次任务未完成自动带到第二天，并用颜色标记。本次在现有本地工作目录修改，不推送、不部署。

## 视觉与流程

空间使用独立物品图标（书本、咖啡杯、相机、火箭、灯泡、耳机、背包、指南针、奖杯、花盆、调色盘、帐篷），与成员动物头像目录分离。已有空间动物头像确定性映射为物品，成员动物头像保持可选。

统一日期选择器使用白色圆角浮层、紫色选中态、今天标识、上下月与回到今天，七列日历与周一开始。提供键盘导航/Escape关闭/点击外部关闭/焦点归位，日期存储保持 YYYY-MM-DD。概览、每日打卡、任务筛选与任务计划日期均复用。

每日打卡变为我的任务清单：新增标题、备注（选填）、计划日期、重复（仅这一次/每天）。行左侧圆形勾选、标题/备注、重复和计划日期标记，支持编辑、删除、取消完成；完成行弱化和划线。一次任务未完成且计划日期早于所选日时标橙色“逾期未完成”，保留原日期直到完成；完成日可看到完成行，之后不再出现。每天任务自起始日期起逐日出现，完成状态按日期独立。无需时间、闹钟、推送等未要求功能。

小组成员都能看到彼此的清单及完成状态，只有创建者能修改自己的条目。小组任务页面与每日打卡复用任务数据和编辑能力，避免形成两套记录。保留现有整日打卡按钮与统计。已有上午/下午内容转换成一次任务，全文放备注并保留原始 daily_logs 数据作备份；页面不再按时段展示。

## 数据契约

扩展 tasks：recurrence once|daily 默认 once、completed_on date、ends_on date、source_log_id 可空唯一（旧记录转换识别）。备注允许5000字保留旧记录。新增 task_completions（task_id,work_date,completed,completed_at）按任务日期唯一，存每日独立完成情况。tasks.updated_at 作为所有修改的乐观锁版本，每次状态变更都更新。

GET /tasks?date=YYYY-MM-DD 返回日期投影 tasks，每行 completed 为该日状态，recurrence、overdue、occurrence_date、completed_at、updated_at 可用。once：target_date<=date 且 (completed_on为空或completed_on>=date)，completed 在completed_on=date时为true；更早历史仍显示未完成。daily：target_date<=date 且 (ends_on为空或date<=ends_on)，完成来自该日 completion。其他日期互不影响。

POST /tasks 接受 {title,notes,targetDate,recurrence}；PATCH /tasks/:id 接受 {updatedAt, title?,notes?,targetDate?,recurrence?,completed?,date?}，勾选与修改条目时前端传所选 date。每天任务重复设置/起始日期固定创建时选择，编辑时仅标题备注（并提示名称修改整个系列）。DELETE 仍要求 updatedAt，daily 另传 date，表示停止从该日开始的重复，保存较早历史；once 删除沿用原行为。新增数据库事务函数在当前活跃成员行锁和任务行锁中检查归属、日期有效范围、版本与完成状态，避免移除成员后写入、跨空间/跨成员编辑或并发丢数据。

空间摘要调用同一 listTasks，统计/动态使用日期投影；同步事件摘要包括 task_completions。旧日志接口保留兼容现有测试，不再作为新版主记录来源。

## 验收

验证跨日每日状态、一次任务逾期与完成后隐藏、历史正确、停止重复保留历史、备注完整迁移、权限/撤销/并发版本、勾选与错误恢复、日历月切换与键盘、独立空间图标目录和数据库约束。最后全量测试、lint、类型、构建与本地接口验收；浏览器现有权限限制不通过替代自动化绕过。
