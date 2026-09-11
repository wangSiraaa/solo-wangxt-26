import AxeBuilder from 'axe-core';
import type { AxeViolationLite, IssueSeverity } from '../types';
import { buildLocator } from './inspect';

export interface AxeScanResult {
  violations: AxeViolationLite[];
  passes: { id: string; description: string; nodes: number }[];
  incomplete: { id: string; description: string; nodes: number }[];
  engineVersion: string;
  error?: string;
}

function mapImpact(impact: string | null | undefined): IssueSeverity {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'serious';
    case 'moderate':
      return 'moderate';
    default:
      return 'minor';
  }
}

/**
 * 直接对隔离 iframe 的 document 运行 axe-core。
 * 注意：axe 运行在宿主页面的 JS 世界里，只是把 iframe 文档作为分析上下文，
 * 不会在 iframe 内执行任何脚本（iframe 无 allow-scripts）。
 */
export async function runAxe(doc: Document): Promise<AxeScanResult> {
  try {
    const result = await AxeBuilder.run(doc, {
      resultTypes: ['violations', 'passes', 'incomplete'],
      reporter: 'v2'
    } as Parameters<typeof AxeBuilder.run>[1]);

    const engineVersion = (AxeBuilder as unknown as { version: string }).version;

    const violations: AxeViolationLite[] = (result.violations || []).map((v) => ({
      id: v.id,
      impact: v.impact as IssueSeverity | null,
      help: v.help,
      description: v.description,
      helpUrl: v.helpUrl,
      wcag: v.tags
        ?.filter((t) => t.startsWith('wcag'))
        .map((t) => t.replace('wcag', 'WCAG ').replace(/(\d)(\d)/, '$1.$2'))
        .join(', '),
      nodes: (v.nodes || []).map((n) => {
        const target = n.target.join(' ');
        let el: Element | null = null;
        try {
          el = doc.querySelector(target);
        } catch {
          el = null;
        }
        return {
          locator: el
            ? buildLocator(el, doc)
            : {
                cssPath: target,
                selectorChain: [target],
                attributes: {},
                htmlTag: (n.html.match(/^<(\w+)/)?.[1] || 'unknown')
              },
          html: n.html,
          summary: n.failureSummary || ''
        };
      })
    }));

    const passes = (result.passes || []).map((p) => ({
      id: p.id,
      description: p.description,
      nodes: p.nodes.length
    }));
    const incomplete = (result.incomplete || []).map((p) => ({
      id: p.id,
      description: p.description,
      nodes: p.nodes.length
    }));

    return { violations, passes, incomplete, engineVersion };
  } catch (err) {
    return {
      violations: [],
      passes: [],
      incomplete: [],
      engineVersion: (AxeBuilder as unknown as { version: string }).version,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
