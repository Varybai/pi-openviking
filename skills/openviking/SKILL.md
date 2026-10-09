---
name: openviking
description: Retrieve and cite OpenViking knowledge, ingest files or URLs, and verify resource processing through MCP. Use for OpenViking or Uni-Viking tasks, viking:// resources, connection diagnosis, and optional LEGO/LDraw connector queries when the service supports them.
license: Apache-2.0
---

# OpenViking 知识库操作

使用宿主 Agent 提供的 OpenViking MCP 工具完成用户任务。先发现当前连接及工具 schema，再选择需要的操作。工具名称、数量、参数和资源路径以当前服务为准。

本 Skill 包含操作指令和相对路径参考文档。它依赖宿主的 MCP 客户端及可访问的 OV 服务；安装 Skill 本身不会注册 MCP 服务器，也不会安装 Pi 扩展或部署 OV。

## 判断当前入口

- 已有可调用的 OV 工具：直接执行任务，复用现有连接。
- 工具不可见、认证失败或需要添加连接：读取 [连接检查](references/connection.md)。
- 宿主是 Pi，且任务涉及完整 package 的安装或连接管理：读取 [Pi package 操作](references/pi-package.md)。其他宿主使用自身的 MCP 配置机制。
- 只缺少地址、账号或凭据来源：询问必要的缺失信息。凭据从已授权的私密来源读取，不要求用户粘贴到聊天。

配置文件存在、HTTP 健康通过、MCP 工具可调用、任务资源可见是不同证据。按任务需要验证到对应阶段；不要以 `/health` 成功证明入库完成或资源权限正常。

## 选择任务流程

| 任务 | 按需读取 |
|---|---|
| 查找知识、读取正文、引用来源、组装上下文 | [检索与证据](references/retrieval.md) |
| 导入本地文件或 URL、恢复批量入库、判断完成状态 | [入库流程](references/ingestion.md) |
| 修改或删除资源、写入长期记忆 | [检索与证据](references/retrieval.md)中的修改规则 |
| LEGO/LDraw 解析或精确连接查询 | [可选 LDraw 流程](references/ldraw.md) |

只加载当前任务需要的参考文档。Pi 专用 `/ov-*` 命令和 CLI 不作为其他宿主的前提。

## 执行时保留的边界

- 使用工具返回的 canonical URI。先检索少量候选，再读取相关正文和来源；连接明细按需读取。
- 普通文档保留服务默认解析设置。只有任务要求时才选择 `vectors_only`、特定 parser 参数、整站抓取或定期 watch。
- 本地文件可能需要签名上传。遵循工具返回的上传协议；若上传会自动受理入库，不再重复调用 `add_resource`。
- 入库通常异步执行。区分上传、受理、正文可读与语义检索可用。未知结果先核对状态或目标资源，再决定是否重试。
- 只在任务范围内修改资源。更新已有内容前读取原文；不要将连接排障扩展为清空资源、重建数据库或部署服务。
- 摘要、检索分数、metadata 和几何数据各有证据边界。它们不能自动证明内容已验证或 LEGO 实体装配可行。

## 报告结果

查询给出结论及支持它的资源 URI。入库给出源、目标 URI、已确认阶段及失败项；抽样成功不能证明全量完成。配置任务给出当前连接和已验证状态，说明是否仍需宿主重载或重启。不要回显 API key、Authorization 或签名上传 URL。
