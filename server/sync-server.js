// server/sync-server.js — RFC-003 极简个人免绑定云同步网关
// 专为单人/自用设计：基于单一 Secret Token 校验，零账号依赖，纯 Node.js 标准库实现 (零外部依赖)。
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function createSyncServer(options = {}) {
  const secretToken = (options.secretToken || process.env.SYNC_SECRET_TOKEN || "aidn-default-secret").trim();
  const storageFile = options.storageFile || path.resolve(__dirname, "../data/cloud-notes.json");
  const port = options.port || Number(process.env.PORT) || 3000;

  // 确保存储目录存在
  const dir = path.dirname(storageFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 内存缓存 + 文件持久化
  let notesMap = new Map();
  let sharedSettings = {
    deepseekApiKey: "",
    deepseekBaseUrl: "https://api.deepseek.com/v1",
    deepseekModel: "deepseek-chat",
    updatedAt: "",
  };

  function loadData() {
    if (fs.existsSync(storageFile)) {
      try {
        const raw = fs.readFileSync(storageFile, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          notesMap = new Map(parsed.map((n) => [n.id, n]));
        } else if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.notes)) {
            notesMap = new Map(parsed.notes.map((n) => [n.id, n]));
          }
          if (parsed.settings) {
            sharedSettings = Object.assign({}, sharedSettings, parsed.settings);
          }
        }
      } catch (err) {
        console.error("[SyncServer] 读取持久化文件失败，初始化空存储:", err.message);
        notesMap = new Map();
      }
    }
  }

  function persistData() {
    try {
      const payload = {
        notes: Array.from(notesMap.values()),
        settings: sharedSettings,
      };
      fs.writeFileSync(storageFile, JSON.stringify(payload, null, 2), "utf-8");
    } catch (err) {
      console.error("[SyncServer] 写入持久化文件失败:", err.message);
    }
  }

  loadData();

  function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 50 * 1024 * 1024) {
          // 限制最大 50MB
          reject(new Error("Payload too large"));
        }
      });
      req.on("end", () => {
        if (!body.trim()) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  function handleCors(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }
    return false;
  }

  const server = http.createServer(async (req, res) => {
    if (handleCors(req, res)) return;

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // 健康检查 (GET /health 或 GET /)
    if ((pathname === "/health" || pathname === "/") && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "aidn-sync-gateway", totalNotes: notesMap.size }));
      return;
    }

    // 增量同步接口 (POST /api/sync 或 POST /)
    if ((pathname === "/api/sync" || pathname === "/") && req.method === "POST") {
      // 1. 校验 Token
      const authHeader = req.headers.authorization || "";
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const incomingToken = bearerMatch ? bearerMatch[1].trim() : "";

      if (!incomingToken || incomingToken !== secretToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing Secret Token" }));
        return;
      }

      // 2. 解析增量负载
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      const { lastSyncAt, deltas = [], settings } = body;
      const serverTime = new Date().toISOString();

      // 3. 将客户端上报的增量合入服务端 (LWW 策略，优先比对 updatedAt)
      let incomingUpdated = 0;
      if (Array.isArray(deltas)) {
        for (const note of deltas) {
          if (!note || !note.id) continue;
          const existing = notesMap.get(note.id);
          if (!existing) {
            // 新增
            const clean = Object.assign({}, note, {
              metadata: Object.assign({}, note.metadata, { dirty: false, syncedAt: serverTime }),
            });
            notesMap.set(note.id, clean);
            incomingUpdated++;
          } else {
            // 已存在，比对时间戳 (优先比对 updatedAt，其次比对 createdAt)
            const existingTime = existing.updatedAt || existing.createdAt || "";
            const incomingTime = note.updatedAt || note.createdAt || "";
            if (incomingTime >= existingTime) {
              const updated = Object.assign({}, existing, note, {
                metadata: Object.assign({}, existing.metadata, note.metadata, {
                  dirty: false,
                  syncedAt: serverTime,
                }),
              });
              notesMap.set(note.id, updated);
              incomingUpdated++;
            }
          }
        }
      }

      // 4. 同步共享配置（如 DeepSeek API Key，以最新更新时间戳为准）
      let settingsUpdated = false;
      if (settings && typeof settings === "object") {
        const incomingKey = (settings.deepseekApiKey || "").trim();
        const incomingUrl = (settings.deepseekBaseUrl || "").trim();
        const incomingModel = (settings.deepseekModel || "").trim();
        const incomingTime = settings.updatedAt || "";

        if (incomingKey || incomingUrl || incomingModel) {
          const isNewer = !sharedSettings.updatedAt || (incomingTime && incomingTime >= sharedSettings.updatedAt);
          // 如果客户端没有提供有效 key，保留已有 key，绝不抹除已有的 API Key
          const keyToSave = incomingKey || sharedSettings.deepseekApiKey;
          const urlToSave = incomingUrl || sharedSettings.deepseekBaseUrl;
          const modelToSave = incomingModel || sharedSettings.deepseekModel;

          if (isNewer || (incomingKey && !sharedSettings.deepseekApiKey)) {
            sharedSettings = {
              deepseekApiKey: keyToSave,
              deepseekBaseUrl: urlToSave,
              deepseekModel: modelToSave,
              updatedAt: incomingTime || serverTime,
            };
            settingsUpdated = true;
          }
        }
      }

      if (incomingUpdated > 0 || settingsUpdated) {
        persistData();
      }

      // 5. 收集自 lastSyncAt 之后在服务端有变更的所有笔记下发给客户端
      const allNotes = Array.from(notesMap.values());
      let notesToReturn = allNotes;
      if (lastSyncAt) {
        const lastSyncTime = new Date(lastSyncAt).getTime();
        notesToReturn = allNotes.filter((n) => {
          const syncedAtTime = n.metadata?.syncedAt ? new Date(n.metadata.syncedAt).getTime() : 0;
          const createdTime = n.createdAt ? new Date(n.createdAt).getTime() : 0;
          return syncedAtTime > lastSyncTime || createdTime > lastSyncTime;
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          serverTime,
          serverReceived: incomingUpdated,
          notes: notesToReturn,
          settings: sharedSettings,
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return {
    server,
    listen(overridePort) {
      const p = overridePort !== undefined ? overridePort : port;
      return new Promise((resolve) => {
        server.listen(p, () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : p);
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        if (typeof server.closeAllConnections === "function") {
          server.closeAllConnections();
        }
        server.close(resolve);
      });
    },
    getNotes() {
      return Array.from(notesMap.values());
    },
    getSettings() {
      return Object.assign({}, sharedSettings);
    },
  };
}

// 允许直接命令行启动：node server/sync-server.js
if (require.main === module) {
  const port = process.env.PORT || 3000;
  const token = process.env.SYNC_SECRET_TOKEN || "aidn-default-secret";
  const app = createSyncServer({ port, secretToken: token });
  app.listen(port).then((p) => {
    console.log(`[SyncServer] 个人免绑定云同步网关已启动在端口 http://localhost:${p}`);
    console.log(`[SyncServer] 鉴权 Secret Token: ${token}`);
  });
}

module.exports = { createSyncServer };
