# 独立只读审核任务

给 reminder_final_review / email_code_review：审查 docs/superpowers/specs/2026-10-13-reminder-checklists-design.md 与新00500taskmigration、lib/data/tasks.ts、taskAPIs、summary/events、TaskChecklist/GroupDailyRecords/DatePicker、00400图标迁移。

用户要求物品空间头像和动物成员头像分离、紫色日历、无上下时段逐条完成、每天/一次；一次未完成跨天延续橙色标记。关注日期历史、每日独立、停止系列保留历史、并发/归属/活跃成员锁、旧日志/空日期迁移保全。根新反馈：once completed_on在另一日期时不能从较早历史再勾选而改变真实完成日期。

只读不修改，独立跑mock/isolated tests可；不要看env/secrets/浏览器/邮件/网络/云/提交。当前都未提交文件，按spec聚焦新功能不要把前几轮账号改版全都当本轮。

最终给一次final具体剩余问题（file+severity）或未发现阻塞。不要反复发确认消息，消息平台加密故障，读本文件即可开始。
