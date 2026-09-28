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
    return Date.parse(remote.updatedAt) > (Date.parse(local.updatedAt) || 0) ? normalize(remote) : local;
  }
  AIDN.settings = { fields, normalize, change, mergeRemote };
})(typeof self !== "undefined" ? self : globalThis);
