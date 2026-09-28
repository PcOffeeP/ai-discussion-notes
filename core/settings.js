// 同步共享配置的版本规则；Token 与端点属于本机，不进入共享字段。
(function (global) {
  const AIDN = global.AIDN = global.AIDN || {};
  const fields = ["deepseekApiKey", "deepseekBaseUrl", "deepseekModel"];
  const defaults = { deepseekApiKey: "", deepseekBaseUrl: "https://api.deepseek.com/v1", deepseekModel: "deepseek-chat", updatedAt: "" };
  function normalize(value = {}) {
    const result = { ...defaults };
    for (const k of fields) if (typeof value[k] === "string") result[k] = value[k].trim();
    if (!result.deepseekBaseUrl) result.deepseekBaseUrl = defaults.deepseekBaseUrl;
    if (!result.deepseekModel) result.deepseekModel = defaults.deepseekModel;
    if (Number.isFinite(Date.parse(value.updatedAt))) result.updatedAt = value.updatedAt;
    return result;
  }
  function change(current, patch) {
    const before = normalize(current);
    const after = normalize({ ...before, ...patch });
    if (fields.some(k => after[k] !== before[k])) after.updatedAt = new Date(Math.max(Date.now(), (Date.parse(before.updatedAt) || 0) + 1)).toISOString();
    return after;
  }
  function mergeRemote(current, remote) {
    const local = normalize(current);
    if (!remote || !Number.isFinite(Date.parse(remote.updatedAt))) return local;
    const incoming = normalize(remote);
    const difference = Date.parse(incoming.updatedAt) - (Date.parse(local.updatedAt) || 0);
    // 相同时间采用稳定字段序列排序，双方独立写入同毫秒时仍可收敛。
    const rank = value => JSON.stringify(fields.map(k => value[k]));
    return difference > 0 || difference === 0 && rank(incoming) > rank(local) ? incoming : local;
  }
  AIDN.settings = { fields, normalize, change, mergeRemote };
  if (typeof module !== "undefined" && module.exports) module.exports = AIDN.settings;
})(typeof self !== "undefined" ? self : globalThis);
