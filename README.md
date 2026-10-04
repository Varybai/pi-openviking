# pi-openviking

把 OpenViking MCP 接入 **Pi Coding Agent 1.0+**。支持连接配置、切换和状态检查，适合通过 Git package 分发给其他用户。

本包使用 Pi 原生 MCP 客户端，发现服务端公开的工具。工具数量和能力由你的 OpenViking 版本决定。标准文档入库、语义检索和源文件读取均通过服务端完成；`lego_query` 需要已实现该工具的 Uni-Viking 服务。

## 安装与首次连接

要求 Node.js 22.18+、Pi 1.0+，以及一个已运行的 OpenViking HTTP 服务。

```bash
pi install git:github.com/Varybai/pi-openviking
```

这会安装到当前用户。只给当前项目使用时，加 `--local`。已打开的 Pi 执行 `/reload`。

如果服务器要求 API key，先通过你的终端或密钥管理器设置环境变量，再启动 Pi。然后在 Pi 内运行：

```text
/ov-setup
```

向导依次收集：连接名称、HTTP 基础地址、可选 account/user、认证方式、作用范围。基础地址例子是 `https://ov.example.com`，不带 `/mcp`；本地服务可用 `http://127.0.0.1:8080`。HTTP 反向代理前缀也支持，例如 `https://example.com/ov`。

认证方式可选：

- **API key from environment variable**：输入变量名，例如 `TEAM_OV_KEY`。这里填写变量名，不能填写实际密钥。Pi 必须能从启动环境读取该变量。
- **No authentication**：仅用于明确允许匿名访问的服务。

保存前会检查 HTTP `/health`。检查失败时可以明确选择先保存。环境变量尚未设置时，也可先保存，再设置变量并重启 Pi。取消向导不会修改配置。保存后，已具备凭据的连接在当前会话注册。

```text
/mcp
/ov-mcp-status
```

`/mcp` 显示实际 MCP 连接、认证状态和工具。`/ov-mcp-status` 只检查 HTTP 健康；HTTP 200 不能证明 MCP 认证成功。

安装本包不会启动 Docker、部署 OpenViking 或导入数据。没有安装生命周期脚本。新机器没有配置时，只提示 `/ov-setup`，不会尝试默认 localhost 地址。

## 管理连接

| Pi 命令 | 作用 |
|---|---|
| `/ov-setup` | 添加命名连接，并选择在项目或用户范围启用 |
| `/ov-connections` | 列出连接名称、地址和认证方式，不显示 key |
| `/ov-use` 或 `/ov-use team` | 选择连接，立即更新当前会话 |
| `/ov-use legacy` | 重新使用已有 ovcli.conf / OPENVIKING 环境配置 |
| `/ov-disconnect` | 在所选范围停用包注册的连接 |
| `/ov-remove` | 确认后删除未被用户或当前项目选择的连接 |
| `/ov-mcp-status` | 检查期望配置的 HTTP 健康，提示是否需要重载 |

一个会话启用一个连接。每个项目可以选择不同连接。用户配置提供默认值，**受信任项目的字段覆盖用户配置**。选择“User default”不会覆盖当前项目已有选择。CLI 改动需要 `/reload`。

删除连接不会扫描其他项目；那些仍引用该名称的项目会报告缺失，不会自动切换到另一服务器。更换 key 或地址时，可以先新增连接，再切换，最后删除旧连接。

## 配置文件与凭据

| 文件 | 内容 |
|---|---|
| `~/.pi/agent/openviking-connections.json` | 命名连接、地址、身份、环境变量引用或私密 token |
| `~/.pi/agent/openviking-mcp.json` | 用户默认连接和工具选项 |
| `<project>/.pi/openviking-mcp.json` | 项目连接选择和工具选项；不接受凭据 |

设置 `PI_CODING_AGENT_DIR` 时，前两个文件位于该目录。连接文件以 `0600` 权限原子写入；包含 token 时仍是磁盘上的明文私密文件，不是系统钥匙串。可以使用环境变量避免持久化 token。项目配置只在 Pi 确认项目受信任后读取。

项目配置例子：

```json
{
  "enabled": true,
  "profile": "team",
  "serverName": "openviking",
  "exposure": "codemode",
  "timeout": 120
}
```

`profile: null` 使用 legacy 配置。`timeout` 单位是秒。`exposure` 支持 `codemode`、`deferred`、`direct`、`hidden`；默认 `codemode`，保留工具并按需发现。可设置 `toolExposure`，例如 `{"forget":"hidden"}`。未知配置字段会报错。

每个命名连接独立解析凭据。选中命名连接后，其他 `OPENVIKING_*` 变量和 ovcli.conf 不会覆盖其地址、账号或 key；只有该连接显式引用的变量会被读取。自定义 `mcpUrl` 和基础地址必须同源。

配置写入使用文件锁，避免两个 Pi 进程覆盖对方修改。写入进程崩溃后可能留下 `.lock` 目录；确认没有写入进程后再清理该锁。

## CLI 与无界面配置

Git package 安装不保证把 bin 加入 shell PATH。可从包目录运行：

```bash
node bin/pi-openviking.mjs --help
node bin/pi-openviking.mjs add team \
  --url https://ov.example.com --key-env TEAM_OV_KEY \
  --account your-account --user your-user
node bin/pi-openviking.mjs use team --local
node bin/pi-openviking.mjs status
```

用户级 Git 安装的常规目录为 `~/.pi/agent/git/github.com/Varybai/pi-openviking/`；项目安装在 `.pi/git/github.com/Varybai/pi-openviking/`。自定义 agent 目录时相应替换路径。`pi list` 可检查安装来源。

`add` 默认检查 HTTP 健康；`--offline` 显式跳过检查。`add` 只保存连接，`use` 选择连接。`use` / `disable` 默认修改用户配置，`--local` 只修改当前项目。`list`、`remove NAME`、`disable` 也可用。

若不使用环境变量，可把密钥管理器的输出通过管道传给 `--api-key-stdin`，保存到用户私密连接文件：

```bash
# 用你的密钥管理器替换此示例左侧命令；不要把 key 写进参数或聊天。
secret-manager read team-ov-key | node bin/pi-openviking.mjs add team \
  --url https://ov.example.com --api-key-stdin
```

也可用 `--anonymous`；三种认证参数只能选一种。可选 `--mcp-url`、`--peer-id` 支持特殊路由和身份。包不执行密钥解析 shell 命令。

## 已有 OpenViking 用户

未选择命名连接时，保留与旧记忆扩展相同的 `~/.openviking/ovcli.conf` 解析器。支持现有 `OPENVIKING_URL`、`OPENVIKING_API_KEY` / `OPENVIKING_BEARER_TOKEN`、`OPENVIKING_ACCOUNT`、`OPENVIKING_USER`、`OPENVIKING_PEER_ID`、`OPENVIKING_MCP_URL` 和配置文件选择变量。

如果环境变量把地址改到另一服务器，却仍会复用旧文件的 key，本包会报错。请为新地址提供对应凭据，或创建命名连接。

## 与原生 MCP 和记忆扩展的关系

- 本包要求 Pi 原生 MCP。旧 `pi-mcp-adapter` 若注册了 `/mcp`，会替代 Pi 原生 MCP；应先停用该旧适配器。
- 文件 `mcp.json` 中的同名服务器优先于扩展注册。先备份，再手动移除或改名旧的同名条目；本包不覆盖你的 MCP 文件。也可以为本包设置不同的 `serverName`。
- `/mcp` 内对扩展服务器的启停/暴露方式修改仅作用于当前会话；持久设置使用本包配置。`pi mcp list` 是 shell 命令，不加载扩展，因此不显示包动态注册的连接。
- 本包不包含单独的 OpenViking 自动记忆扩展。已有 `viking_*` 工具可继续由记忆扩展提供。命名连接只控制本包 MCP；记忆扩展仍使用自身配置，切换本包不会同步切换记忆扩展。
- 本地文件的上传、入库、解析、L0/L1 生成与索引由服务端工具处理。包不改变普通文档或 LDraw 解析逻辑。
- 自建 Pi SDK 会话需要显式加载原生 MCP，以及所选 exposure 对应的 codemode/tool-search 内置扩展。CLI 已包含这些组件。

## 开发与分发

```bash
npm test
npm run check
npm run check:pack
```

使用标准 `package.json` 的 `pi.extensions` 声明；Pi host 为 peer dependency，无第三方运行时依赖。包中不含个人连接配置、数据库、LDraw 库或测试凭据。

当前通过 GitHub 分发，未发布 npm。可以使用 `pi install git:github.com/Varybai/pi-openviking@<commit>` 固定版本。配置设计依据见 [docs/design.md](docs/design.md)。许可和凭据解析器来源见 [NOTICE](NOTICE)。
