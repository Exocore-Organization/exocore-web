export type ProjectStatus = "running" | "stopped" | "error" | "building";

export interface ProjectConfig {
  name: string;
  author: string;
  description: string;
  language: string;
  run: string;
  createdAt: string;
}

export interface ExoConfig {
  project: {
    name: string;
    author: string;
    description: string;
    language: string;
    runtime: string;
    icon?: string;
  };
  runtime: {
    run: string;
    port: number;
    autoStart: boolean;
  };
  state: {
    status: ProjectStatus;
  };
}

export interface RuntimeConfig {
  run: string;
  port: number;
  autoStart: boolean;
}

export interface Project {
  id: string;
  name: string;
  author: string;
  description: string;
  language: string;
  createdAt: string;
  status: ProjectStatus | "Archived" | "Online";
  port?: number;
  pid?: number;
}
