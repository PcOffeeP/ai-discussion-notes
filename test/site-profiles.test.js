// site-profiles 边界测试：平台匹配与注册扩展点。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load");

const AIDN = load("adapters/sources/site-profiles.js");
const { matchProfile, registerSiteProfile } = AIDN;

test("ChatGPT 域名匹配", () => {
  assert.equal(matchProfile("chatgpt.com").platform, "ChatGPT");
  assert.equal(matchProfile("chat.openai.com").platform, "ChatGPT");
});

test("Kimi 域名匹配（含 www 与旧域名）", () => {
  assert.equal(matchProfile("kimi.com").platform, "Kimi");
  assert.equal(matchProfile("www.kimi.com").platform, "Kimi");
  assert.equal(matchProfile("kimi.moonshot.cn").platform, "Kimi");
  assert.equal(matchProfile("www.kimi.moonshot.cn").platform, "Kimi");
});

test("未注册平台返回 null", () => {
  assert.equal(matchProfile("claude.ai"), null);
  assert.equal(matchProfile("example.com"), null);
});

test("registerSiteProfile：新平台作为纯数据接入", () => {
  registerSiteProfile({
    platform: "Claude",
    sourceType: "chat",
    matches: (h) => /(^|\.)claude\.ai$/.test(h),
    getTitle: (doc) => doc.title || "",
  });
  assert.equal(matchProfile("claude.ai").platform, "Claude");
  assert.equal(matchProfile("www.claude.ai").platform, "Claude");
});

test("getTitle 剥离平台后缀", () => {
  const gpt = matchProfile("chatgpt.com");
  assert.equal(gpt.getTitle({ title: "学习方法讨论 - ChatGPT", querySelector: () => null }), "学习方法讨论");
  const kimi = matchProfile("kimi.com");
  assert.equal(kimi.getTitle({ title: "读书笔记 - Kimi", querySelector: () => null }), "读书笔记");
});
