# 动物头像与小组记录更新

本次新增 12 款卡通动物头像，可从右上角、侧栏个人区域或自己的成员卡片更换。头像选择保存到数据库，并同步到成员、任务、动态和聊天中的头像。

每日打卡页保留自己的上下午编辑器，下方新增“小组记录”。记录自动保存成功后即可对同组可见，完成打卡状态独立显示；其他成员只能阅读。选择历史日期可查看当天的记录，未保存的本地草稿不会共享。

## Supabase 增量迁移

现有线上数据库已正常运行，只需在 [该项目的 SQL Editor](https://supabase.com/dashboard/project/khvpwwwaxitejdqlkoia/sql/new) 执行 [0005_member_avatars.sql](../supabase/migrations/0005_member_avatars.sql)。该脚本给 `members` 添加 `avatar_id` 列与允许值约束，保留现有成员、会话和所有业务数据，不需要重新运行 0001。

执行成功后通知 Data API 更新结构缓存：

```sql
NOTIFY pgrst, 'reload schema';
```

然后推送更新代码，由 Vercel 构建新部署。先迁移、后发布，避免新代码读取尚未添加的列。旧成员未选择头像时会获得稳定的默认动物；之后可以自行更换。

本地 PGlite 在下次启动时自动应用该增量迁移。云数据库和本机数据库各自独立。
