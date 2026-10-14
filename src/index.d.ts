import type { Report, Rule } from './core.js';
export * from './core.js';
export interface OrphanOptions {
  baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean;
  /** Report pages more than this many clicks from the start page (default 3). */
  maxDepth?: number;
  /** Entry page for click depth (default "/"). */
  start?: string;
  /** Pages that are fine without inbound links. */
  ignore?: string[];
  /** Report pages with a single inbound link (default true, info). */
  singleLink?: boolean;
  now?: Date; toolVersion?: string; [option: string]: unknown;
}
export interface PageRef { file: string; path: string }
export type LinkGraph = Map<PageRef, { out: Set<PageRef>; in: Map<PageRef, { nofollow: boolean; line?: number }>; jsIn: Set<PageRef> }>;
export declare const RULES: Record<string, Rule>;
export declare const SITE_OPTIONS: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }>;
export declare const SITE_HELP: string;
export declare function check(dir: string, opts?: OrphanOptions, config?: Record<string, unknown>, configFile?: string): Report;
export declare function analyze(site: unknown, opts?: OrphanOptions, config?: Record<string, unknown>): { findings: Report['findings']; info: Record<string, unknown>; summary: string };
export declare function linkGraph(site: unknown, pages: PageRef[]): LinkGraph;
export declare function clickDepth(graph: LinkGraph, start: PageRef | undefined): Map<PageRef, number>;
