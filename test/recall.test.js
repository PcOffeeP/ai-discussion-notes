// test/recall.test.js — RFC-003 复习 Prompt 组装与响应解析测试。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load");

const AIDN = load(
  "core/note.js",
  "core/recall/prompt-builder.js",
  "core/recall/response-parser.js"
);

const { promptBuilder, responseParser } = AIDN.recall;

test("promptBuilder: 系统提示词完整包含出题法则与输出规范", () => {
  assert.ok(promptBuilder.RECALL_SYSTEM_PROMPT.includes("头版头条 · 深度推演 (q1)"));
  assert.ok(promptBuilder.RECALL_SYSTEM_PROMPT.includes("报眼要闻 · 概念辨析 (q2)"));
  assert.ok(promptBuilder.RECALL_SYSTEM_PROMPT.includes("微言速测 · 一问快答 (q3)"));
  assert.ok(promptBuilder.RECALL_SYSTEM_PROMPT.includes("必须以合法的 JSON 格式返回"));

  assert.ok(promptBuilder.PROFILE_SYSTEM_PROMPT.includes("认知成长追踪助手"));
  assert.ok(promptBuilder.PROFILE_SYSTEM_PROMPT.includes("activeTopics"));
});

test("promptBuilder: buildRecallUserPrompt 组装宏观画像、目标会话与批注", () => {
  const profile = {
    activeTopics: ["六层架构", "分布式 Raft"],
    recentShift: "从单体业务向分布式迁移",
  };
  const notes = [
    AIDN.note.createNote({
      id: "n_1",
      conversationTitle: "Python 六层架构",
      source: "ChatGPT",
      contentMarkdown: "持久化适配器负责 Repository 端口解包装包",
      thoughts: [{ id: "t_1", text: "防腐层是中继转换带", createdAt: "2026-09-25T12:00:00Z" }],
    }),
    AIDN.note.createNote({
      id: "n_2",
      conversationTitle: "Python 六层架构",
      source: "ChatGPT",
      contentMarkdown: "领域实体禁止依赖外层框架",
    }),
  ];

  const prompt = promptBuilder.buildRecallUserPrompt({
    profile,
    seriesName: "Python 六层架构",
    source: "ChatGPT",
    notes,
    targetNoteId: "n_1",
  });

  assert.ok(prompt.includes("用户近期活跃主题：六层架构、分布式 Raft"));
  assert.ok(prompt.includes("近期兴趣跃迁：从单体业务向分布式迁移"));
  assert.ok(prompt.includes("专栏名称：Python 六层架构 (来源: ChatGPT)"));
  assert.ok(prompt.includes("核心聚焦, ID: n_1"));
  assert.ok(prompt.includes("防腐层是中继转换带"));
  assert.ok(prompt.includes('targetNoteId: "n_1"'));
});

test("promptBuilder: buildProfileUserPrompt 格式化近期笔记摘要", () => {
  const notes = [
    AIDN.note.createNote({
      conversationTitle: "分布式共识",
      source: "Kimi",
      contentText: "Raft 算法通过随机选举超时避免选票瓜分",
    }),
  ];
  const prompt = promptBuilder.buildProfileUserPrompt(notes);
  assert.ok(prompt.includes("1. [会话: 分布式共识 | 来源: Kimi] Raft 算法通过随机选举超时避免选票瓜分"));
});

test("responseParser: extractJsonString 提取 Markdown 包裹的 JSON", () => {
  const mdJson = "```json\n{\"foo\":\"bar\"}\n```";
  assert.equal(responseParser.extractJsonString(mdJson), '{"foo":"bar"}');

  const dirtyText = "模型回答的前言解释：\n{\"foo\":123}\n请查收。";
  assert.equal(responseParser.extractJsonString(dirtyText), '{"foo":123}');
});

test("responseParser: parseRecallResponse 强类型解析与校验", () => {
  const rawPayload = JSON.stringify({
    issueId: "issue_01",
    seriesName: "Python 专栏",
    leadSource: "ChatGPT · 昨天",
    q1: {
      title: "为什么防腐层不可缺少？",
      sub: "架构隔离思考",
      clue: "外部契约常发生变动",
      anchor: "核心业务规则不可动摇",
      targetNoteId: "n_1",
    },
    q2: {
      title: "防腐层与普通 Mapper 的本质区别？",
      body: "前者包含语义隔离与模型转换",
    },
    q3: {
      title: "数据库改字段，领域实体要改吗？",
      body: "不应该，由适配层消化变更",
    },
  });

  const parsed = responseParser.parseRecallResponse(rawPayload);
  assert.equal(parsed.issueId, "issue_01");
  assert.equal(parsed.q1.title, "为什么防腐层不可缺少？");
  assert.equal(parsed.q1.targetNoteId, "n_1");
  assert.equal(parsed.q2.body, "前者包含语义隔离与模型转换");
  assert.equal(parsed.q3.body, "不应该，由适配层消化变更");

  // 缺少必须字段时抛出异常
  assert.throws(() => {
    responseParser.parseRecallResponse(JSON.stringify({ q1: {} }));
  }, /缺少 q1.title/);
});

test("responseParser: parseProfileResponse 解析与安全兜底", () => {
  const raw = JSON.stringify({
    activeTopics: ["Python", "Rust"],
    recentShift: "关注高性能计算",
    dormantTopics: ["CSS"],
  });
  const res = responseParser.parseProfileResponse(raw);
  assert.deepEqual(res.activeTopics, ["Python", "Rust"]);
  assert.equal(res.recentShift, "关注高性能计算");
  assert.deepEqual(res.dormantTopics, ["CSS"]);
  assert.ok(res.updatedAt);
});
