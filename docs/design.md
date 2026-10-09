# 安装与连接设计

本方案以 Pi 1.0.2 的本机文档和源码为准。它把 package 安装与连接配置分开，面向其他用户的 Pi 环境。

## 对比依据

| 来源 | 实际机制 | 本包采用的方式 |
|---|---|---|
| Pi 官方 `docs/packages.md` | `pi.extensions`、Git/npm/本地来源、用户与项目安装、host peer | 仓库根目录就是可安装包；显式扩展入口；host 不重复打包 |
| Pi 官方 `docs/mcp.md`、`docs/extensions.md` | `registerMcpServer` / `unregisterMcpServer`；动态连接；同名文件配置优先 | 交给原生 MCP 管理传输、工具发现和会话连接，不复制客户端 |
| assembly-tools 0.1.0 `extensions/setup.mjs`、`extensions/config.mjs` | 显式 setup；项目配置；原子写入；安装与运行时创建分开 | 安装不连接无配置的地址、不部署服务；显式配置写入 |
| SoL-Pi 0.1.0 `docs/configuration.md` | 用户/项目配置分层；`session_start` 后检查 `isProjectTrusted()` | 信任判定前不读项目连接选择；区分用户默认和项目覆盖 |
| pi-web-access 0.28.0 `index.ts`、`gemini-web-config.ts` | 独立配置文件；provider 路由；已有认证复用；浏览器凭据显式启用 | 保留 ovcli 兼容入口；新连接使用明确认证方式 |

源码与文档链接：

- [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
- [Pi MCP](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md)
- [Pi extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [assembly-tools](https://github.com/Varybai/assembly-tools)
- [SoL-Pi configuration](https://github.com/NVlabs/SoL-Pi/blob/main/docs/configuration.md)
- [pi-web-access](https://github.com/nicobailon/pi-web-access)

具体差异：SoL-Pi 的项目文件整体替代用户文件。本包按字段覆盖，用于让各项目复用用户设置的 timeout/exposure，仅改变 profile。该规则在 README 明确说明，并有测试。

## 连接流程

```text
pi install Git package
    → /ov-setup 收集地址、身份、认证方式、作用范围
    → HTTP 健康检查和保存确认
    → 用户连接文件 + 项目或用户选择
    → Pi registerMcpServer
    → Pi 原生 MCP 握手、认证、tools/list
    → /mcp 查看实际状态
```

空配置只提示 setup。新增连接不会复制机器上的隐式旧 key。取消输入或取消最后确认不会写入。没有环境变量时可明确保存待用配置，设置变量并重启 Pi 后再连接。HTTP 健康检查与 MCP 认证分开报告。

## 状态与凭据边界

连接定义始终放在用户 agent 目录。项目文件仅保存选择名称和行为选项。命名连接不与 legacy 环境/文件凭据逐字段合并。CLI 允许通过 stdin 写入 token，但不接受 key 参数；Pi 普通文本输入框只接受变量名，因为当前公共 input API 不提供密码遮罩选项。

profile/token 文件为 0600，采用临时文件与原子替换，每次修改持有独立文件锁。重复名称拒绝覆盖。未知字段、跨源 MCP URL、动态 header 表达式、缺失 key 均报错。原始 token 不进入状态输出、项目文件或包。

本包一次激活一个 MCP 连接。它不把 endpoint 写入 `mcp.json`，避免形成两个配置来源。Pi 文件配置优先这一规则保留，因此 `/mcp` 是最终状态来源。

## 验证边界

单元测试使用临时目录和假凭据，覆盖首次启动、作用范围、凭据隔离、向导取消、CLI、原子保存、文件锁、错误脱敏。实际 Pi 验收使用隔离 agent/project 目录，检查 Git 安装、原生 MCP 注册和服务端只读调用。

Git package 不包含 OpenViking 服务或数据。MCP 工具列表来自服务器。没有 `lego_query` 的普通 OpenViking 仍能使用其现有工具。无 npm 发布步骤。

## Pi package 与标准 Skill 共用一个来源

0.3.0 新增 `skills/openviking/SKILL.md`，使用标准 YAML `name`、`description` 和 `license`。通用检索、入库、连接检查及可选 LDraw 说明保存在同目录的 `references/`。Pi 专用操作单独放在 `references/pi-package.md`，仅在 Pi package 场景读取。

`package.json` 保留原有 `pi.extensions`，增加 `pi.skills: ["./skills"]` 和 npm `files` 中的 `skills/`。`pi install` 加载扩展与 Skill；标准 `npx skills add` 只分发选中的 Skill 目录。根 README 是 Agent 的安装和流程入口，操作规则由 Skill 参考文档维护。

Skill 没有到根 README、`src/` 或 `bin/` 的文件依赖。Pi 专用 CLI 是有条件的外部运行依赖，需要完整 package；其他宿主按自身 MCP 机制连接 OV。两种安装方式均不部署 OV 服务。Skill 安装成功与 MCP 连接成功分别报告。

包检查覆盖 Skill 资源完整打包及相对链接不越出 Skill 目录。安装验收使用隔离项目，分别运行 Pi package 安装和 Skills CLI 的 Codex / Claude Code 安装，并核对实际发现结果与文件内容。标准格式参考 [Agent Skills specification](https://agentskills.io/specification)。
