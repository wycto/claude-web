export interface SessionMeta {
  id: string;
  title: string;
  cwd: string | null;
  gitBranch: string | null;
  lastModified: number | null;
  createdAt: number | null;
  tag: string | null;
  contextSize: number;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

export type Role = 'user' | 'assistant';

export interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: { content: string; isError: boolean };
}

export interface Attachment {
  name: string;
  kind: 'image' | 'file';
  mediaType?: string; // for images
  data?: string; // base64 (images)
  text?: string; // extracted text (files)
}

export type RenderItem =
  | {
      kind: 'text';
      role: Role;
      text: string;
      key: string;
      uuid?: string; // SDK message uuid — anchor for rewind
      attachments?: { name: string; kind: 'image' | 'file' }[];
    }
  | { kind: 'thinking'; text: string; key: string }
  | { kind: 'tool'; tool: ToolUseBlock; key: string }
  | {
      kind: 'status';
      key: string;
      user: string | null;
      model: string;
      permissionMode: string;
      cwd: string;
      sessionId: string | null;
      connected: boolean;
      branch: string | null;
      totalCost: number;
      messageCount: number;
    }
  | {
      kind: 'result';
      key: string;
      cost: number;
      durationMs: number;
      numTurns: number;
      isError: boolean;
      usage?: Record<string, unknown>;
    };

export interface PermissionRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: unknown[];
}

export interface GitFile {
  path: string;
  status: string;
  staged: boolean;
  untracked: boolean;
  x: string;
  y: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  files: GitFile[];
}

export interface DirListing {
  path: string;
  parent: string | null;
  separator: string;
  directories: { name: string; path: string; hidden?: boolean }[];
}

export interface UsageWindow {
  key: string;
  label: string;
  utilization: number; // 0-100 已用百分比
  resetsAt: string | null; // ISO8601
}

export interface UsageState {
  available: boolean;
  subscriptionType?: string | null;
  rateLimitsAvailable?: boolean;
  cost?: number;
  windows?: UsageWindow[];
  reason?: 'no_session' | 'error';
}
