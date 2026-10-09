# 检索与证据读取

| 需要完成的动作 | 优先选择 |
|---|---|
| 快速语义检索 | `find`；已知资源范围时提供 schema 支持的 `target_uri` |
| 深度检索或会话相关检索 | `search` |
| 组装有 token 预算的上下文 | 服务支持时使用 `search(mode="context")`；不要假设存在独立 `context` 工具 |
| 查看目录或定位文件 | `list`、`tree`、`glob`；限定目录和结果上限 |
| 核对具体内容 | `read`；当前 Uni-Viking 参数为 `uris`，可传单个 URI 或数组 |
| 搜索原文中的术语 | `grep` |
| 查看来源和知识元数据 | 服务支持时使用 `read_metadata` |

先检索少量候选，再读取与问题有关的内容。优先用 L0 摘要判断相关性，用 L1 overview 理解资源，需要证据时读取正文或来源文件。使用工具实际返回的 canonical URI，不要根据名称猜测路径。

当前 Uni-Viking 的 `search(mode="context")` 不接受 `target_uri` 或 `read_content`。需要限定目录时，先用 `find` 或 `search(mode="list")` 筛选，再读取候选。其他服务版本仍以其 schema 为准。

回答时保留资源 URI，并区分来源中的事实、解析器输出和推断。检索分数表示相关性；摘要和 metadata 的存在不能证明结论已验证。检索无结果时，先检查范围、权限和术语，再报告未找到的内容。

## 修改、删除与记忆

只有任务需要时才调用 `write`、`edit`、`forget`、`remember` 或 watch 管理工具。先确认资源和变更范围；更新已有文档前读取原文，局部修改优先使用服务支持的 `edit`。调用后检查业务结果，不能只看工具传输是否成功。

在 Pi 中，本包 MCP 与独立记忆扩展的 `viking_*` 工具使用各自配置。切换本包 profile 不会同步切换记忆扩展。使用这些工具前分别核对目标，避免将它们当作同一连接。
