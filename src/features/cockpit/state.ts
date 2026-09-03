/**
 * Cockpit state machine (gui-rework-plan §5).
 * Pure reducer — no VS Code imports. Drives which regions of the integrated
 * workspace are visible: current page, top status strip, bottom drawer
 * (log / issues / wizard), running state.
 */

import { CockpitPage } from './layout';

export type DrawerKind = 'none' | 'log' | 'issues' | 'wizard';

export interface CockpitDrawer {
  kind: DrawerKind;
  expanded: boolean;
  title: string;
  /** log/wizard lines (streamed, capped at 200). */
  lines: string[];
}

export interface CockpitTop {
  projectName: string;
  health: number | null;
  running: string | null;
  templateBehind: number;
}

export interface CockpitState {
  page: CockpitPage;
  top: CockpitTop;
  drawer: CockpitDrawer;
  lastBuildOk: boolean | null;
  issueCount: number;
}

export type CockpitEvent =
  | { type: 'navigate'; page: CockpitPage }
  | { type: 'drawer:toggle'; expand: boolean }
  | { type: 'log:start'; title: string }
  | { type: 'log:append'; line: string }
  | { type: 'log:done'; ok: boolean }
  | { type: 'issue:summary'; count: number }
  | { type: 'template:update'; behind: number }
  | { type: 'health'; score: number }
  | { type: 'project'; name: string };

const LOG_CAP = 200;

export function initialCockpitState(): CockpitState {
  return {
    page: 'overview',
    top: { projectName: '', health: null, running: null, templateBehind: 0 },
    drawer: { kind: 'none', expanded: false, title: '', lines: [] },
    lastBuildOk: null,
    issueCount: 0,
  };
}

export function reduceCockpit(state: CockpitState, event: CockpitEvent): CockpitState {
  switch (event.type) {
    case 'navigate':
      return { ...state, page: event.page };
    case 'drawer:toggle':
      return { ...state, drawer: { ...state.drawer, expanded: event.expand } };
    case 'log:start':
      return {
        ...state,
        top: { ...state.top, running: event.title },
        drawer: { kind: 'log', expanded: true, title: event.title, lines: [] },
      };
    case 'log:append':
      if (state.drawer.kind !== 'log') {
        return state;
      }
      return {
        ...state,
        drawer: { ...state.drawer, lines: [...state.drawer.lines, event.line].slice(-LOG_CAP) },
      };
    case 'log:done':
      // Keep the drawer open so the tail of the run stays visible; the
      // controller collapses it 3 s later (or the user toggles it).
      return {
        ...state,
        top: { ...state.top, running: null },
        lastBuildOk: event.ok,
      };
    case 'issue:summary':
      return {
        ...state,
        issueCount: event.count,
        drawer:
          event.count > 0
            ? { kind: 'issues', expanded: true, title: `${event.count} 个错误已映射到“问题”面板`, lines: [] }
            : state.drawer.kind === 'issues'
              ? { ...state.drawer, expanded: false }
              : state.drawer,
      };
    case 'template:update':
      return { ...state, top: { ...state.top, templateBehind: event.behind } };
    case 'health':
      return { ...state, top: { ...state.top, health: event.score } };
    case 'project':
      return { ...state, top: { ...state.top, projectName: event.name } };
    default:
      return state;
  }
}
