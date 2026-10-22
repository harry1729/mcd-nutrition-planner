/**
 * 麦当劳 MCP Server 最小客户端
 *
 * 零外部依赖，直接以 JSON-RPC 2.0 over Streamable HTTP 调用 https://mcp.mcd.cn
 *
 * 为什么不用 SDK：本项目主张「clone 即可运行」，避免评委因安装依赖失败而无法验证。
 * 协议细节参考 MCP Specification：
 *   - initialize → notifications/initialized → tools/call
 *   - Streamable HTTP 响应可能为 application/json 或 text/event-stream(SSE)
 *
 * 安全：Token 仅从环境变量 MCD_MCP_TOKEN 读取，绝不写入代码或配置文件。
 */

const DEFAULT_URL = 'https://mcp.mcd.cn';
const PROTOCOL_VERSION = '2025-06-18';

export class McdMcpClient {
  /**
   * @param {object} opts
   * @param {string} [opts.token] MCP Token；默认取process.env.MCD_MCP_TOKEN
   * @param {string} [opts.url]   MCP Server 地址
   * @param {number} [opts.timeoutMs]
   */
  constructor(opts = {}) {
    this.token = opts.token ?? process.env.MCD_MCP_TOKEN;
    this.url = opts.url ?? DEFAULT_URL;
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.sessionId = null;
    this.nextId = 1;
    this.ready = false;
    this.callLog = [];
  }

  assertConfigured() {
    if (!this.token) {
      throw new Error(
        '未配置 MCP Token。请在 https://open.mcd.cn/mcp 用手机号登录后领取，' +
        '然后设置环境变量：export MCD_MCP_TOKEN=你的Token',
      );
    }
  }

  /** 底层 HTTP 传输：兼容 JSON 与 SSE 两种响应 */
  async #rpc(method, params) {
    this.assertConfigured();
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.token}`,
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 401) throw new Error('MCP Token 无效或已过期（401），请重新申请');
        if (res.status === 429) throw new Error('触发限流（429），每 Token 每分钟上限 600 次');
        throw new Error(`MCP 调用失败 HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const raw = await res.text();
      return this.#parsePayload(raw);
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`MCP 请求超时（${this.timeoutMs}ms）`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** SSE 响应形如 `data: {...}\n\n`，需抽取最后一条 data */
  #parsePayload(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    const lines = trimmed.split('\n').filter((l) => l.startsWith('data:'));
    if (lines.length === 0) return null;
    const last = lines[lines.length - 1].replace(/^data:\s*/, '');
    try {
      return JSON.parse(last);
    } catch {
      return null;
    }
  }

  async #notify(method, params) {
    this.assertConfigured();
    await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${this.token}`,
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    }).catch(() => { /* 通知失败可忽略 */ });
  }

  /** 初始化会话，必须在任何 tools/call 之前调用 */
  async init() {
    if (this.ready) return this;
    const res = await this.#rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: false }, sampling: {} },
      clientInfo: { name: 'mcd-catering-planner', version: '1.0.0' },
    });
    if (res?.error) throw new Error(`初始化失败：${res.error.message}`);
    await this.#notify('notifications/initialized', {});
    this.ready = true;
    return this;
  }

  /** 列出服务端可用工具 */
  async listTools() {
    await this.init();
    const res = await this.#rpc('tools/list', {});
    return res?.result?.tools ?? [];
  }

  /**
   * 调用工具
   * @returns 解析后的业务数据（已剥离 MCP content 包装）
   */
  async callTool(name, args = {}) {
    await this.init();
    const started = Date.now();
    const res = await this.#rpc('tools/call', { name, arguments: args });
    const cost = Date.now() - started;
    this.callLog.push({ tool: name, args: Object.keys(args), ms: cost });

    if (res?.error) throw new Error(`工具 ${name} 调用失败：${res.error.message}`);
    if (res?.result?.isError) {
      const text = (res.result.content ?? []).map((c) => c.text ?? '').join('');
      throw new Error(`工具 ${name} 返回错误：${text.slice(0, 300)}`);
    }

    this.#record(name, args);
    return parseContent(res?.result);
  }

  #record(name, args) {
    // 结构化调用日志，用于生成 MCP_INTEGRATION.md 与工作台审计
    this.callLog.push({ tool: name, args, at: new Date().toISOString() });
  }

  /** 本次会话已调用的工具名（去重），用于自检是否真实使用 MCP */
  usedTools() {
    return [...new Set(this.callLog.map((c) => c.tool))];
  }
}

/** 从 MCP content 包装中提取结构化数据 */
export function parseContent(result) {
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;

  const text = (result.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // 非 JSON 文本：部分接口（如 list-nutrition-foods）返回纯文本表格，
    // 直接返回字符串本身，交给调用方按各自格式解析。
    return text;
  }
}