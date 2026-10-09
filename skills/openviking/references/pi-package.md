# Pi package 连接操作

仅当宿主是 Pi 且任务涉及本包安装、连接配置或排障时读取。下文命令依赖完整的 pi-openviking package；仅安装 Skill 的环境不包含这些运行时文件。

## 安装与配置

前提：Node.js 22.18+、Pi Coding Agent 1.0+、已运行的 OpenViking HTTP 服务。检查 `node --version`、`pi --version` 和 `pi list`。按实际缺项处理。

在**目标项目工作目录**安装：

```bash
pi install git:github.com/Varybai/pi-openviking --local
```

用户明确要求全局安装时才去掉 `--local`。非交互执行且安装已获授权时，可追加 `--approve`。需要固定版本时，使用已核实的 `git:github.com/Varybai/pi-openviking@<commit>`。当前分发来源是 GitHub。

### 定位 CLI

根据安装来源和配置找到实际包目录，并确认其中存在 `bin/pi-openviking.mjs`。常见位置：

- 项目安装：`<project>/.pi/git/github.com/Varybai/pi-openviking/`
- 用户安装：`<agent-dir>/git/github.com/Varybai/pi-openviking/`
- 本地路径安装：Pi settings 中声明的路径；相对路径相对于该 settings 文件解析。

`<agent-dir>` 默认是 `~/.pi/agent`；设置 `PI_CODING_AGENT_DIR` 时使用该目录。不要假设 bin 已加入 PATH。

后面的 shell 示例中，先把 `OV_PACKAGE_DIR` 替换为已核实的绝对路径。示例地址、连接名称和变量名也必须替换为任务中的实际值。

```bash
OV_PACKAGE_DIR="/absolute/path/to/pi-openviking"
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" list
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" status
```

**执行 CLI 时保持 cwd 为目标项目。** `use --local` 和 `disable --local` 根据 cwd 写入 `.pi/openviking-mcp.json`；不要先切换到包目录。

`list` 输出连接名称、地址和认证类型。`status` 输出解析后的期望配置及 HTTP 健康结果。优先使用这两个脱敏入口，不要把原始凭据文件输出到上下文。

### 新建并选择连接

确认以下输入：连接名称、HTTP 基础地址、认证方式、服务要求的 account/user，以及项目或用户作用范围。基础地址不带 `/mcp`，可以包含反向代理前缀，例如 `https://example.com/ov`。不要从本地开发端口推断他人的部署地址。

优先引用已配置的环境变量。以下示例只保存 `TEAM_OV_KEY` 这个变量名：

```bash
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" add team \
  --url https://ov.example.com --key-env TEAM_OV_KEY
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" use team --local
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" status
```

服务要求身份字段时，在 `add` 中添加实际的 `--account`、`--user` 或 `--peer-id`。自定义 MCP 路由可用 `--mcp-url`，其地址必须与基础地址同源。

执行规则：

- `add` 把连接定义保存到用户连接文件；它不选择连接，也不接受 `--local`。
- `use NAME --local` 选择当前项目连接。去掉 `--local` 会修改用户默认值；项目已有选择仍优先。
- `add` 默认要求 HTTP 健康检查通过。只在明确需要保存待用配置时使用 `--offline`；此时不能报告连接已就绪。
- `--key-env`、`--api-key-stdin`、`--anonymous` 必须且只能选一种。只有服务明确允许匿名访问时才用 `--anonymous`。
- 若需保存 token，从已授权的密钥来源直接通过管道传入 `--api-key-stdin`。不要把 token 写入 shell 参数、命令文本、聊天、项目文件或 Git。
- 重复名称会报错。先 `list` 判断是否可复用；更换地址或 key 时可以新建连接、验证后切换，再按任务需要删除旧连接。

`TEAM_OV_KEY` 必须在**运行 Pi 的进程环境**中存在。在 Agent 的子 shell 中 `export` 不能改变已运行 Pi 的父进程环境。环境变量刚设置时，需要用新环境重启 Pi；单独 `/reload` 不会补齐缺失的父进程环境变量。

### 复用与维护

```bash
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" use legacy --local
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" use team --local
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" disable --local
node "$OV_PACKAGE_DIR/bin/pi-openviking.mjs" remove old-team
```

以上是不同操作的参考，不要顺序全部执行。`legacy` 复用已有 ovcli/OV 环境配置。`remove` 会拒绝删除被用户或当前项目选中的连接，但不会扫描其他项目；其他项目可能仍引用该名称。

### CLI 与 Pi 交互命令的边界

`/reload`、`/mcp` 和 `/ov-*` 是 Pi 会话命令，**不是 shell 命令，也不是模型工具名**。不要通过 bash 执行它们，不要把发送一段命令文本当作执行成功。

CLI 修改后，已打开的 Pi 需要重载。若当前 Agent 没有可用的会话控制接口，完成配置后明确报告“配置已保存，等待重载”，并给出一次必要的 `/reload` 操作。需要新环境变量时说明应重启 Pi。

仅在可操作 Pi 交互界面时使用下表；无界面执行使用 CLI：

| Pi 命令 | 行为 |
|---|---|
| `/ov-setup` | 收集连接信息、检查健康、确认保存并选择作用范围；输入框只填密钥变量名 |
| `/ov-use` 或 `/ov-use team` | 选择连接和作用范围，更新当前会话 |
| `/ov-connections` | 列出已保存连接，不显示 key |
| `/ov-disconnect` | 在所选范围停用包注册的连接 |
| `/ov-remove` | 确认后删除未被用户或当前项目选择的连接 |
| `/ov-mcp-status` | 检查期望配置的 HTTP 健康，提示是否需要重载 |
| `/mcp` | 查看 Pi 实际 MCP 连接、认证和工具状态 |

## 配置规则

| 位置 | 内容及处理方式 |
|---|---|
| `<agent-dir>/openviking-connections.json` | 命名连接、地址、身份及认证来源；通过 CLI 管理，避免原样输出 |
| `<agent-dir>/openviking-mcp.json` | 用户默认 profile 和工具选项 |
| `<project>/.pi/openviking-mcp.json` | 受信任项目的覆盖字段；只保存连接选择和行为选项 |
| `~/.openviking/ovcli.conf` / OV 环境配置 | `profile: null` 时使用的 legacy 来源 |

解析顺序是默认值、用户字段、受信任项目字段。未受信任项目的配置不会生效。未知字段会报错。

允许的行为字段：`enabled`、`profile`、`serverName`、`exposure`、`timeout`、`toolExposure`。默认启用，profile 为 `null`，serverName 为 `openviking`，exposure 为 `codemode`，timeout 为 120 秒。exposure 可选 `codemode`、`deferred`、`direct`、`hidden`。

命名连接独立解析凭据，只读取其明确引用的环境变量，不与 legacy 地址或 key 合并。连接文件以 0600 权限原子写入；token 模式保存的是私密文件中的明文值。配置写入使用文件锁。

没有配置时，本包提示 setup，不主动尝试默认地址。安装包不会创建 OV 服务或导入业务数据。

## 排障

| 观察到的情况 | 下一步 |
|---|---|
| `setup_required` | 核实地址和认证来源，新增连接或选择已有连接 |
| `disabled` | 任务需要启用时，在正确范围执行 `use`；核对项目覆盖字段 |
| API key 缺失 | 检查引用的变量名和 Pi 进程环境；不要打印变量值，不要回退到其他服务器的 key |
| endpoint 与凭据文件不匹配 | 为目标地址提供独立凭据或命名连接 |
| HTTP 健康成功，但 MCP 不可用 | 检查 MCP 路由、认证、Pi 原生 MCP 是否加载及同名配置冲突 |
| 工具已连接，但资源不可见 | 检查账号、用户、canonical URI 和检索范围；不要据此重建或清空资源 |
| `pi mcp list` 没有本包连接 | 该 shell 命令不加载扩展；检查当前 Pi 会话的原生 MCP 状态 |
| 配置已改，当前会话仍用旧连接 | CLI 修改后重载；环境变量新增后用新环境重启；再次核对实际连接 |
| `mcp.json` 中有同名服务器 | 文件配置优先。先识别覆盖来源；按已授权范围备份并调整目标条目，保留其他服务器 |
| 旧 adapter 接管 `/mcp` | 本包要求 Pi 原生 MCP。确认依赖范围后调整旧 adapter，避免影响其他 MCP 连接 |
| 配置被锁定 | 先检查是否仍有写入进程；仅在确认锁已遗留后清理对应锁 |
| 自建 Pi SDK 会话没有 MCP 工具 | 显式加载原生 MCP 及 exposure 所需的 codemode/tool-search 内置扩展 |

`/mcp` 对扩展连接的启停或 exposure 修改仅作用于当前会话。持久修改应使用本包配置。排查时保留实际错误类型和脱敏证据，不回显凭据文件、Authorization 或签名上传 URL。
