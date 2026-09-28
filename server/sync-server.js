// 单人 Token 网关。先持久化后确认；失败不发布内存状态。
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, timingSafeEqual } = require("node:crypto");

function createSyncServer(options = {}) {
  const secretToken = String(options.secretToken ?? process.env.SYNC_SECRET_TOKEN ?? "").trim();
  if (!secretToken || secretToken === "aidn-default-secret") throw new Error("请设置独立的 SYNC_SECRET_TOKEN；禁止使用默认 Token");
  const storageFile = options.storageFile || process.env.SYNC_STORAGE_FILE || path.resolve(__dirname, "../data/cloud-notes.json");
  const io = options.fs || fs;
  io.mkdirSync(path.dirname(storageFile), { recursive: true });
  let state = { storageId: randomUUID(), notes: [], settings: null };
  if (io.existsSync(storageFile)) {
    // 损坏文件必须由管理员恢复，不能当空库覆盖。
    const loaded = JSON.parse(io.readFileSync(storageFile, "utf8"));
    state = Array.isArray(loaded) ? { ...state, notes: loaded } : { ...state, ...loaded };
    if (!Array.isArray(state.notes) || state.notes.some(n => !validNote(n))) throw new Error("云端笔记文件格式损坏");
  }
  let clock = Math.max(0, ...state.notes.map(n => Date.parse(n.metadata?.syncedAt) || 0));
  function time() { clock = Math.max(Date.now(), clock + 1); return new Date(clock).toISOString(); }
  function persist(next) {
    const temp = storageFile + "." + randomUUID() + ".tmp";
    let fd;
    try {
      fd = io.openSync(temp, "wx", 0o600);
      io.writeFileSync(fd, JSON.stringify(next), "utf8");
      io.fsyncSync(fd);
      io.closeSync(fd); fd = undefined;
      io.renameSync(temp, storageFile);
    } finally {
      if (fd !== undefined) io.closeSync(fd);
      if (io.existsSync(temp)) io.unlinkSync(temp);
    }
  }
  function timestamp(n) { return Date.parse(n.updatedAt || n.createdAt) || 0; }
  function validNote(n) {
    return n && typeof n === "object" && !Array.isArray(n) && typeof n.id === "string" && n.id.length > 0 &&
      Number.isFinite(Date.parse(n.updatedAt || n.createdAt)) &&
      (!n.deletedAt || typeof n.deletedAt === "string" && Number.isFinite(Date.parse(n.deletedAt))) &&
      (!n.metadata || typeof n.metadata === "object" && !Array.isArray(n.metadata)) &&
      (!n.thoughts || Array.isArray(n.thoughts)) &&
      ["contentText", "contentMarkdown", "contentHtml"].every(k => n[k] === undefined || typeof n[k] === "string");
  }
  function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []; let bytes = 0; let failed = false;
      req.on("data", chunk => {
        if (failed) return;
        bytes += chunk.length;
        if (bytes > (options.maxBodyBytes || 50 * 1024 * 1024)) {
          failed = true; chunks.length = 0;
          return reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (failed) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
        catch { reject(Object.assign(new Error("Invalid JSON body"), { status: 400 })); }
      });
      req.on("error", reject);
      req.on("aborted", () => reject(new Error("Aborted request")));
    });
  }
  function reply(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if ((pathname === "/health" || pathname === "/") && req.method === "GET") {
        return reply(res, 200, { status: "ok", service: "aidn-sync-gateway" });
      }
      if (!["/api/sync", "/"].includes(pathname) || req.method !== "POST") return reply(res, 404, { error: "Not found" });
      const token = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
      const a = Buffer.from(token), b = Buffer.from(secretToken);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return reply(res, 401, { error: "Unauthorized" });
      const body = await parseJsonBody(req);
      const settings = body?.settings;
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          (body.deltas !== undefined && (!Array.isArray(body.deltas) || body.deltas.some(n => !validNote(n)))) ||
          (body.lastSyncAt != null && !Number.isFinite(Date.parse(body.lastSyncAt))) ||
          (settings != null && (typeof settings !== "object" || Array.isArray(settings) ||
            ["deepseekApiKey", "deepseekBaseUrl", "deepseekModel", "updatedAt"].some(k => settings[k] !== undefined && typeof settings[k] !== "string") ||
            (settings.updatedAt && !Number.isFinite(Date.parse(settings.updatedAt)))))) {
        return reply(res, 400, { error: "Invalid sync payload" });
      }
      const serverTime = time();
      const map = new Map(state.notes.map(n => [n.id, n]));
      for (const note of body.deltas || []) {
        const old = map.get(note.id);
        if (!old || timestamp(note) > timestamp(old) || timestamp(note) === timestamp(old) && (!old.deletedAt || note.deletedAt)) {
          const record = note.deletedAt ? { id: note.id, schemaVersion: 3, createdAt: note.createdAt, updatedAt: note.updatedAt, deletedAt: note.deletedAt } : note;
          map.set(note.id, { ...record, metadata: { ...record.metadata, dirty: false, syncedAt: serverTime } });
        }
      }
      let shared = state.settings;
      if (settings && (settings.deepseekApiKey || settings.updatedAt)) {
        if (!shared?.updatedAt || Date.parse(settings.updatedAt) > Date.parse(shared.updatedAt)) {
          shared = {
            deepseekApiKey: settings.deepseekApiKey?.trim() || "",
            deepseekBaseUrl: settings.deepseekBaseUrl?.trim() || "https://api.deepseek.com/v1",
            deepseekModel: settings.deepseekModel?.trim() || "deepseek-chat",
            updatedAt: settings.updatedAt || serverTime,
          };
        }
      }
      const next = { ...state, notes: Array.from(map.values()), settings: shared };
      try { persist(next); } catch { return reply(res, 503, { error: "Storage commit failed; retry later" }); }
      state = next;
      const since = Date.parse(body.lastSyncAt) || 0;
      return reply(res, 200, {
        protocolVersion: 2, storageId: state.storageId, serverTime,
        notes: state.notes.filter(n => (Date.parse(n.metadata?.syncedAt) || 0) > since), settings: state.settings,
      });
    } catch (err) {
      return reply(res, err.status || 400, { error: err.status ? err.message : "Invalid request" });
    }
  });
  return {
    server,
    listen(p = options.port ?? Number(process.env.PORT || 3000)) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(p, options.host || "0.0.0.0", () => { server.removeListener("error", reject); resolve(server.address().port); });
      });
    },
    close: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())),
    getNotes: () => state.notes.filter(n => !n.deletedAt),
    getSettings: () => state.settings,
  };
}
if (require.main === module) {
  try {
    const app = createSyncServer();
    app.listen().then(port => console.log(`[SyncServer] Listening on ${port}`)).catch(() => { console.error("[SyncServer] 无法启动监听"); process.exitCode = 1; });
  } catch { console.error("[SyncServer] 启动失败；请检查 Token 和存储文件"); process.exitCode = 1; }
}
module.exports = { createSyncServer };
