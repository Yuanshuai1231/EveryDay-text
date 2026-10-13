# UI 最终反馈（给 reminder_ui）

原范围：TaskChecklist、TaskBoard、CheckinWorkspace、GroupDailyRecords、CheckinButton、checkin page、SpaceProvider 类型、相关 unit tests。其它文件由根整合。

请继续完成范围内最后测试/类型/lint。DatePicker 已可导入。根已修改 overview 和 space-date-transition tests；不要改它们。浏览器明确保存设置拒绝127.0.0.1，禁止改用localhost/CDP/Playwright/browser bypass；不要做浏览器验收。

新增历史保护：once 任务 completed_on 在另一日期时，较早历史日期应显示未完成历史；不能再次勾选改变真实完成日。将该 checkbox 禁用并提示“已于 YYYY-MM-DD 完成”，原完成日仍可取消完成。后端会对这种错误写入拒绝400。可将 completed_on:string|null 作为 Task 类型可选字段以兼容旧 fixtures。

不要发实时确认消息或反复解释加密问题，消息工具存在故障。直接读取此文件并完成，然后 final 汇报文件和测试并释放槽位。不提交/推送/云/邮件/环境配置操作。
