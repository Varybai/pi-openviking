# pi-openviking — Agent 操作手册

你是在 Pi Coding Agent 中执行任务的 Agent。使用本包连接 OpenViking，完成知识检索、资源读取和已获授权的入库操作。先判断当前连接状态，再选择下面的流程。

本包通过 Pi 原生 MCP 注册服务器。工具和参数由服务端提供，**每次以当前会话发现的工具 schema 为准**。不要固定假设工具数量、部署地址、账号、资源路径或 LEGO snapshot。

## 1. 先判断任务与连接状态

| 当前状态或任务 | 执行动作 |
|---|---|
| 所需 OV 工具已可调用 | 直接执行任务；跳过安装和重新配置 |
| 找不到工具，但包可能已安装 | 检查 `pi list`、工具发现入口和连接状态；按第 6 节排查 |
| 包未安装，任务需要配置接入 | 检查版本，按第 2 节安装并配置 |
| 已有可用命名连接 | 复用该连接；需要切换时使用 `use` |
| 已有 `ovcli.conf` 或完整 OV 环境配置 | 可使用 `legacy`，无需复制密钥或新建连接 |
| 没有地址或认证来源 | 只询问缺失的地址、身份字段、密钥来源和必要作用范围；不要要求在聊天中粘贴 key |
| 用户要求查询或入库 | 连接就绪后按第 4 节执行，不把接入任务扩大为服务部署 |

只操作用户指定的服务、项目和资源范围。项目任务优先使用项目级安装和连接选择。需要用户级配置时，应有对应授权。已获授权且信息齐全的步骤直接执行。

## 2. 安装与配置：Agent 优先使用 CLI

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

## 3. 验证连接就绪

依次检查三层证据，不要混用结论：

1. **配置层**：确认期望的 profile、地址和 serverName。CLI `status` 成功只证明其解析出的地址通过 HTTP 健康检查；它不能证明当前 Pi 已切换连接。
2. **MCP 层**：确认当前会话已发现该服务器工具，并执行一次 schema 允许的只读调用，例如 `health`。若是切换连接，还需核对实际 MCP 服务器地址或连接状态。
3. **任务层**：对任务指定的资源做小范围检索或读取，确认账号权限和资源可见性。健康检查不证明资源存在。

默认 `exposure` 为 `codemode`，全部 MCP 工具不一定直接出现在模型工具列表中。使用当前 Pi 提供的工具发现或 codemode 入口，读取工具说明和 schema 后调用。`deferred` 使用对应的工具搜索入口。不要因顶层列表没有 `find` 就判断服务未连接。

默认 MCP serverName 是 `openviking`。Pi 中工具名可能形如 `mcp__openviking__find`；以实际发现的名称为准。下面使用服务端短名称描述操作。

## 4. 执行知识库任务

### 检索、读取与引用

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

### 普通文件和 URL 入库

1. 确认源文件或 URL、目标资源范围和用户要求。重复执行任务前，先检查已返回的目标 URI 或已有结果，避免重复提交。
2. 发现 `add_resource` 并读取当前 schema。普通入库保留服务默认解析参数。没有明确需求时，不设置 LDraw 参数，也不改为 `vectors_only` 或 `no_split`。
3. URL 入库：按 schema 提交 URL。先判断单页、仓库或整站范围；不要把单页任务扩展为整站抓取或定期 watch。
4. 本地文件入库：确认文件在 Agent 可访问的文件系统中。将路径提交给 `add_resource` 后，按实际返回的上传流程执行。不要假设远端服务可以读取客户端路径。
5. 若返回签名上传地址，按响应要求上传文件字节。当前 Uni-Viking 使用 multipart 字段 `file`；上传后服务自动受理入库，**不要再重复调用 `add_resource`**。其他版本按返回协议处理。
6. 记录响应中的 canonical URI、任务标识和状态。只根据已观察到的状态报告进度。

签名上传 URL 含临时凭据。只用于该次上传，不写入最终答复、Git 或长期记录。上传结果不明时，先核对状态或目标资源；不要直接重传。明确失效且未受理时，再申请新的上传指令。

入库通常异步执行。“上传成功”“请求受理”“正文可读”“语义检索可用”是不同状态。使用当前接口支持的任务状态、资源读取和检索结果验证用户要求的阶段。若接口不能确认后台完成，报告已验证的阶段和待确认项；不要虚构状态查询工具或反复提交入库。

`processing_mode="vectors_only"` 会跳过语义理解阶段，不生成或刷新 L0/L1。只有任务明确要求这种行为时才使用。解析、摘要和索引由 OpenViking 执行；Agent 根据返回状态处理输入与结果。

### LEGO / LDraw 任务：按服务能力启用

只有任务涉及 LEGO/LDraw，且服务提供对应能力时才使用本流程。普通文档任务沿用上一节。

- `.dat/.ldr/.mpd` 能否解析由服务端 parser 和配置决定，安装本包本身不能证明支持。先依据已知服务能力或小样例结果确认。
- 需要精确连接条件时，先读取 `lego_query` 的 schema，再使用任务指定或 catalog 中核实的 snapshot、零件编号和筛选条件。尺寸单位按服务定义核对。
- 使用结果中的 `part_uri` 和连接 ID 读取资源卡、聚合说明及必要的连接证据。需要语义解释时再调用 `find/search/read`。
- 连接明细按需读取，避免把整个连接目录放入上下文。资源卡、原始几何或检索命中不能证明实体装配可行。
- 工具缺失或 snapshot 不存在时，明确报告能力缺口。不要编造结果，不要套用另一环境的零件总数、连接点总数或路径。

### 修改、删除与记忆

只有任务需要时才调用 `write`、`edit`、`forget`、`remember` 或 watch 管理工具。先确认资源和变更范围；更新已有文档前读取原文，局部修改优先使用服务支持的 `edit`。调用后检查业务结果，不能只看工具传输是否成功。

本包 MCP 与独立记忆扩展的 `viking_*` 工具使用各自配置。切换本包 profile 不会同步切换记忆扩展。使用这些工具前分别核对目标，避免将它们当作同一连接。

## 5. 配置解析规则

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

## 6. 按症状排查

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

## 7. 完成任务时的报告

按实际任务简要报告：

- 配置任务：安装/选择的作用范围、连接名称、已验证的 HTTP 与 MCP 状态，以及是否仍需重载或重启。
- 查询任务：结论、支持结论的资源 URI，以及证据不足的部分。
- 入库任务：源与目标 URI、已确认的处理阶段、失败项和待确认项。批量结果按逐项记录汇总；抽样成功不能替代全量完成证据。

只报告实际执行和验证的结果。若缺少环境、权限或交互入口，说明具体阻塞点以及下一项必要操作。

维护本包时，可在包目录执行 `npm test`、`npm run check`、`npm run check:pack`；日常 OV 任务无需运行这些开发检查。设计依据见 [docs/design.md](docs/design.md)，第三方来源与许可见 [NOTICE](NOTICE)。
