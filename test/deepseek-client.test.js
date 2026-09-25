// test/deepseek-client.test.js — DeepSeek 客户端与启发式降级测试。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load");

const AIDN = load(
  "core/note.js",
  "core/recall/prompt-builder.js",
  "core/recall/response-parser.js",
  "adapters/llm/deepseek-client.js"
);

test("deepseekClient: 未配置 API Key 时走启发式号外装配，零网络依然可用", async () => {
  const client = AIDN.llm.createDeepSeekClient({ apiKey: "" });
  const notes = [
    AIDN.note.createNote({
      id: "n_test_1",
      conversationTitle: "Python 六层架构设计",
      source: "ChatGPT",
      contentMarkdown: "核心业务模型与持久化模型隔离是防腐层的核心职责。",
    }),
  ];

  const issue = await client.generateRecallIssue({
    notes,
    targetNoteId: "n_test_1",
    seriesName: "Python 六层架构设计",
    source: "ChatGPT",
  });

  assert.ok(issue.issueId.startsWith("issue_"));
  assert.equal(issue.seriesName, "Python 六层架构设计");
  assert.ok(issue.q1.title.includes("Python 六层架构设计"));
  assert.equal(issue.q1.targetNoteId, "n_test_1");
  assert.ok(issue.q1.clue);
  assert.ok(issue.q1.anchor);
  assert.ok(issue.q2.title);
  assert.ok(issue.q3.body);
});

test("deepseekClient: 未配置 API Key 时走启发式画像提炼", async () => {
  const client = AIDN.llm.createDeepSeekClient();
  const notes = [
    AIDN.note.createNote({ conversationTitle: "Raft 选举" }),
    AIDN.note.createNote({ conversationTitle: "向量检索与 RAG" }),
  ];

  const profile = await client.generateCognitiveProfile({ recentNotes: notes });
  assert.ok(profile.activeTopics.includes("Raft 选举"));
  assert.ok(profile.activeTopics.includes("向量检索与 RAG"));
  assert.ok(profile.recentShift);
  assert.ok(profile.updatedAt);
});

test("deepseekClient: 提供 API Key 与 fetchFn 时发起真实 HTTP 调用并解析结构化号外", async () => {
  let capturedUrl = "";
  let capturedBody = null;
  let capturedHeaders = null;

  const mockResponsePayload = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            issueId: "issue_net_01",
            seriesName: "网络专栏",
            leadSource: "DeepSeek · 刚刚",
            q1: {
              title: "为什么不能直接暴露领域实体？",
              sub: "网络测试",
              clue: "外部框架随时变更",
              anchor: "业务逻辑隔离",
              targetNoteId: "n_net_1",
            },
            q2: {
              title: "概念辨析",
              body: "实体与值对象的差异",
            },
            q3: {
              title: "微言速测",
              body: "值对象不可变",
            },
          }),
        },
      },
    ],
  };

  const mockFetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => mockResponsePayload,
    };
  };

  const client = AIDN.llm.createDeepSeekClient({
    apiKey: "sk-mock-key",
    baseUrl: "https://mock.deepseek.com/v1",
    fetchFn: mockFetch,
  });

  const notes = [
    AIDN.note.createNote({ id: "n_net_1", conversationTitle: "网络测试", contentText: "正文" }),
  ];

  const issue = await client.generateRecallIssue({
    notes,
    targetNoteId: "n_net_1",
  });

  assert.equal(capturedUrl, "https://mock.deepseek.com/v1/chat/completions");
  assert.equal(capturedHeaders["Authorization"], "Bearer sk-mock-key");
  assert.equal(capturedBody.model, "deepseek-chat");
  assert.equal(capturedBody.messages[0].role, "system");
  assert.equal(capturedBody.messages[1].role, "user");
  assert.equal(issue.issueId, "issue_net_01");
  assert.equal(issue.q1.targetNoteId, "n_net_1");
});

test("deepseekClient: testConnection 校验有效性", async () => {
  const mockFetchSuccess = async () => ({ ok: true, json: async () => ({}) });
  const clientSuccess = AIDN.llm.createDeepSeekClient({
    apiKey: "sk-valid",
    fetchFn: mockFetchSuccess,
  });
  const res = await clientSuccess.testConnection();
  assert.equal(res.ok, true);

  // 空 Key 抛出明确异常
  const clientEmpty = AIDN.llm.createDeepSeekClient({ apiKey: "", fetchFn: mockFetchSuccess });
  await assert.rejects(async () => {
    await clientEmpty.testConnection();
  }, /请先填写 DeepSeek API Key/);

  // 鉴权失败报错
  const mockFetchFail = async () => ({
    ok: false,
    status: 401,
    text: async () => "Authentication Fails (Invalid API Key)",
  });
  const clientFail = AIDN.llm.createDeepSeekClient({ apiKey: "sk-bad", fetchFn: mockFetchFail });
  await assert.rejects(async () => {
    await clientFail.testConnection();
  }, /连接失败 \[HTTP 401\]/);
});

