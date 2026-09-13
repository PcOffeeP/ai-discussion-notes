// core/ports.js — 端口定义（纯文档，无实现）。
//
// 本项目有三条边界，各对应一个端口：
//
// @interface NoteRepo —— 持久化端口
//   save(note: Note): Promise<Note>
//   list(): Promise<Note[]>            // 实现方负责迁移，返回的永远是当前 schema
//   update(id: string, patch: object): Promise<Note|null>  // 部分字段合并；patch 须可序列化（要跨消息边界）
//   delete(id: string): Promise<void>
//   clear(): Promise<number>           // 返回清除条数
//   生产适配器: adapters/chrome/storage-note-repo.js (service worker)
//   远程门面:   adapters/chrome/runtime-client.js   (content / notes page)
//   测试适配器: adapters/test/memory-note-repo.js
//   未来:      CloudSyncNoteRepo（云同步，实现同一接口即可无缝替换）
//
// @interface CaptureSource —— 捕获来源端口（推模式）
//   start(emit: (raw: RawCapture) => void): void
//   stop(): void
//   生产适配器: adapters/sources/dom-selection-source.js（网页选区）
//   预留:      LocalHttpSource（桌面 Agent POST 127.0.0.1:PORT/capture）
//
// @interface KV —— chrome.storage 的窄抽象
//   get(keys: string|string[]): Promise<object>
//   set(items: object): Promise<void>
//   生产适配器: adapters/chrome/kv.js (ChromeKV)
//   测试适配器: adapters/chrome/kv.js (MemoryKV)
//
// RawCapture —— 与 DOM 无关的捕获输入：
//   { html?, text?, source, sourceType, conversationTitle?, conversationUrl?, metadata? }
//
// 纪律：Port 之外禁止出现第三个抽象层；适配器必须薄到无可测。
// （本文件仅为文档，不导出任何代码。）
