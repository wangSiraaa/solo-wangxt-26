/**
 * 测试专用：在任何模块（尤其 axe-core）加载前，
 * 把 jsdom 的 window/document 安装为全局对象。
 * 必须在 smoke.ts 的第一行 import。
 */
import { JSDOM } from 'jsdom';

const boot = new JSDOM('<!doctype html><html><body></body></html>');
const g = globalThis as unknown as Record<string, unknown>;
g.window = boot.window;
g.document = boot.window.document;
g.DOMParser = boot.window.DOMParser;
g.Node = boot.window.Node;
g.Element = boot.window.Element;
g.HTMLElement = boot.window.HTMLElement;
g.getComputedStyle = boot.window.getComputedStyle.bind(boot.window);
if (!g.CSS) {
  const escape = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, (ch) => `\\${ch}`);
  g.CSS = { escape };
}

/** 在引导 window 的 document 中写入 HTML（axe 要求文档与其所在 realm 一致） */
export function loadIntoBootDocument(html: string): Document {
  const w = boot.window;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return w.document;
}

/** 新建一个带 defaultView 的独立文档（模拟 iframe contentDocument） */
export function newWindow(html: string): Window {
  return new JSDOM(html).window as unknown as Window;
}
