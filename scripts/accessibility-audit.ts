#!/usr/bin/env bun
/**
 * accessibility-audit.ts — WCAG 2.1 AA route audit
 * @version 1.2.0
 *
 * Audits the route surface of an already-running portal with axe-core.
 * Authenticated route coverage can be added by passing additional URL values
 * with A11Y_COOKIE set to a short-lived staging session cookie; this script
 * never creates, prints, or stores credentials.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const baseUrl = process.env.A11Y_BASE_URL ?? "http://127.0.0.1:3000";
const sessionCookie = process.env.A11Y_COOKIE?.trim();
const baseOrigin = new URL(baseUrl).origin;
const suppliedUrls = process.argv.slice(2).filter((value) => value.startsWith("http://") || value.startsWith("https://"));
const urls = suppliedUrls.length > 0 ? suppliedUrls : [`${baseUrl.replace(/\/$/, "")}/login`];

type AxeResult = { violations: Array<{ id: string; impact?: string | null; help: string; nodes: Array<{ target: unknown; failureSummary?: string }> }>; incomplete: unknown[] };

async function auditUrl(url: string): Promise<AxeResult> {
  if (sessionCookie && new URL(url).origin !== baseOrigin) {
    throw new Error("A11Y_COOKIE may only be sent to URLs sharing A11Y_BASE_URL origin");
  }
  const response = await fetch(url, {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : undefined,
  });
  if (!response.ok && response.status !== 307 && response.status !== 308) throw new Error(`${url} returned HTTP ${response.status}`);
  const html = await response.text();
  const dom = new JSDOM(html, { url, runScripts: "dangerously", pretendToBeVisual: true });
  const { window } = dom;
  window.eval(axeSource);
  const axe = (window as unknown as { axe: { run(document: Document, options: Record<string, unknown>): Promise<AxeResult> } }).axe;
  const result = await axe.run(window.document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    resultTypes: ["violations", "incomplete"],
  });
  dom.window.close();
  return result;
}

let failed = false;
for (const url of urls) {
  try {
    const result = await auditUrl(url);
    console.log(`[a11y] ${url}: ${result.violations.length} violation(s), ${result.incomplete.length} incomplete check(s)`);
    for (const violation of result.violations) {
      failed = true;
      console.error(`  ${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}`);
      for (const node of violation.nodes) console.error(`    ${JSON.stringify(node.target)} ${node.failureSummary ?? ""}`.trim());
    }
  } catch (error) {
    failed = true;
    console.error(`[a11y] ${url}: ${error instanceof Error ? error.message : "audit failed"}`);
  }
}

process.exitCode = failed ? 1 : 0;
