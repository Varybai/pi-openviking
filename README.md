# pi-openviking — Agent 安装与使用入口

本仓库提供 Pi package 和标准 Agent Skill。先判断当前宿主，再选择一个安装入口。两种方式共用 `skills/openviking/` 内的操作指令。

| 宿主与需求 | 安装结果 |
|---|---|
| Pi 使用完整 package | Pi MCP 扩展、连接管理 CLI，以及 `openviking` Skill |
| 其他 Agent 使用标准 Skill | `openviking` Skill 及其全部参考文档；MCP 连接由宿主配置 |

## Pi：安装 package

要求 Pi 1.0+、Node.js 22.18+。在目标项目目录执行：

```bash
pi install git:github.com/Varybai/pi-openviking --local
```

明确需要用户级安装时去掉 `--local`。安装已获授权的非交互流程可追加 `--approve`。已有 Pi 会话需 `/reload`；没有会话控制接口时，准确报告待重载状态。

Pi 通过 `package.json` 的 `pi.extensions` 和 `pi.skills` 同时发现扩展与 Skill：

```json
{
  "pi": {
    "extensions": ["./src/index.mjs"],
    "skills": ["./skills"]
  }
}
```

所需 OV 工具已可调用时直接执行任务。需要连接配置、切换或排障时，读取 [Pi package 操作](skills/openviking/references/pi-package.md)。现有 `/ov-setup`、`/ov-use`、`/ov-connections`、`/ov-remove`、`/ov-disconnect`、`/ov-mcp-status` 和 CLI 继续由扩展提供。

## 其他 Agent：安装标准 Skill

在目标项目目录执行标准安装器，并按实际宿主选择目标：

```bash
npx skills add Varybai/pi-openviking --skill openviking --agent claude-code
```

Codex 使用：

```bash
npx skills add Varybai/pi-openviking --skill openviking --agent codex
```

也可执行 `npx skills add Varybai/pi-openviking` 交互选择。默认项目范围，用户级安装加 `--global`。`--list` 只列出可安装的 Skill；非交互且已获授权时使用 `--yes`；需要复制而非软链接时加 `--copy`。Pi 的 `-l` 表示项目安装，而 Skills CLI 的 `-l` 表示列出，不要混用。

确认安装器输出的实际 Skill 路径及宿主发现结果，再读取 [SKILL.md](skills/openviking/SKILL.md)。只安装 Skill 的目录包含入口、参考文档和许可证，不依赖仓库根目录的 README、CLI 或 Node 依赖。

Skill 不会自动配置 MCP 或执行 Pi 扩展。当前宿主没有可用的 OV 工具时，读取 [宿主连接指南](skills/openviking/references/connection.md)，在已有授权范围内用宿主自身的配置入口添加连接。不要为其他 Agent 执行 `/ov-setup` 或假设 `pi-openviking` CLI 已安装。

同一个 Pi 环境选择完整 package 即可同时获得 Skill。若已通过 Skills CLI 安装同名 Skill，先核对两份来源并保留一份有效安装，避免同名发现冲突。

## 执行任务

从 [openviking Skill](skills/openviking/SKILL.md) 选择流程，按需读取参考文档：

- [检索与证据](skills/openviking/references/retrieval.md)：搜索、读取、上下文组装、资源修改。
- [文件与 URL 入库](skills/openviking/references/ingestion.md)：签名上传、异步状态和重试边界。
- [可选 LEGO / LDraw](skills/openviking/references/ldraw.md)：服务能力核对、精确连接查询和证据边界。

以当前 MCP schema 为准，不固定工具数量、地址、账号、资源路径或 snapshot。分别核对安装成功、Skill 已发现、MCP 可调用及任务完成状态。

## 维护与验证

```bash
npm test
npm run check
npm run check:pack
```

package 使用显式入口和打包白名单。`npx skills add` 安装的同一份 Skill 使用标准 `SKILL.md` 和 YAML `name` / `description` 元数据；所有必需参考文件均在 Skill 目录内。

当前通过 GitHub 分发，未发布 npm。安装器获取方式和 OV 服务部署分别处理。连接设计及双入口边界见 [docs/design.md](docs/design.md)，来源和许可见 [NOTICE](NOTICE)。
