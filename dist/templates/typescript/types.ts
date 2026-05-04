export type Result<T, E = Error> =
    | { ok: true;  value: T }
    | { ok: false; error: E };

export type Maybe<T> = T | null | undefined;

export interface User {
    id: number;
    name: string;
    email: string;
    role: "admin" | "editor" | "viewer";
    createdAt: Date;
    metadata?: Record<string, unknown>;
}

export type UserSummary = Pick<User, "id" | "name" | "role">;

export type DeepReadonly<T> = {
    readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

export type EventMap = {
    "user:created": User;
    "user:deleted": { id: number };
    "app:ready": { timestamp: Date };
};

export type EventKey = keyof EventMap;
export type EventPayload<K extends EventKey> = EventMap[K];
