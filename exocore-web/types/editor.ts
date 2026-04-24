export interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: FileNode[];
}

export interface EditorState {
  files: FileNode[];
  activeFile: FileNode | null;
  content: string;
  isLoading: boolean;
  isSaving: boolean;
  currentTheme: string;
  wordWrap: boolean;
}

export interface EditorTheme {
  bg: string;
  surface: string;
  border: string;
  accent: string;
  textMain: string;
  textMuted: string;
}

export type SidebarTab = "explorer" | "npm" | "github" | "drive" | "ai";
export type BottomPanel = "none" | "terminal" | "console" | "webview" | "problems";
export type FileType = "code" | "image" | "video" | "audio";

export interface DiagnosticItem {
  severity: "error" | "warning" | "info";
  message: string;
  line: number;
  column: number;
  code?: number;
  source?: string;
}

export interface NpmPackage {
  name: string;
  version: string;
  isUsed?: boolean;
}

export interface NpmSearchResult {
  package: {
    name: string;
    description: string;
    version: string;
    links?: { npm?: string };
  };
  score?: {
    final: number;
  };
}

export interface GitFileStatus {
  file: string;
  status: string;
}

export interface GitRepo {
  name: string;
  clone_url: string;
  private: boolean;
  description?: string;
  stargazers_count?: number;
}

export interface AiMessage {
  id: string;
  role: "user" | "ai";
  text?: string;
  steps?: string[];
  files?: AiFileAction[];
  isGenerating?: boolean;
  provider?: "exocore" | "kilo";
}

export interface AiFileAction {
  path: string;
  status: "pending" | "created" | "failed" | "deleted";
}

export interface WsPayload {
  type: "greeting" | "step" | "language" | "plan_done" | "file_done" | "delete_file" | "done";
  data: WsPayloadData;
}

export type WsPayloadData =
  | string
  | { files: string[] }
  | { file: string; code: string }
  | { file: string; code?: never }
  | { message?: string };
