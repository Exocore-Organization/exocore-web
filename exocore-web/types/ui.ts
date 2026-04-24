export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

export interface UITheme {
  bg: string;
  surface: string;
  border: string;
  accent: string;
  textMain: string;
  textMuted: string;
}

export interface UIState {
  theme: string;
  sidebarOpen: boolean;
  notifications: Notification[];
}
