import type { Result, Maybe } from "./types";

export function ok<T>(value: T): Result<T> {
    return { ok: true, value };
}

export function err<E = Error>(error: E): Result<never, E> {
    return { ok: false, error };
}

export function unwrap<T>(result: Result<T>): T {
    if (result.ok) return result.value;
    throw result.error;
}

export function defined<T>(value: Maybe<T>, label = "value"): T {
    if (value == null) throw new Error(`Expected ${label} to be defined`);
    return value;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function groupBy<T, K extends string>(
    items: T[],
    key: (item: T) => K,
): Record<K, T[]> {
    return items.reduce(
        (acc, item) => {
            const k = key(item);
            (acc[k] ??= []).push(item);
            return acc;
        },
        {} as Record<K, T[]>,
    );
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
    fn: () => Promise<T>,
    attempts = 3,
    delayMs = 500,
): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (i < attempts - 1) await sleep(delayMs * (i + 1));
        }
    }
    throw lastError;
}

export function formatDate(date: Date, locale = "en-US"): string {
    return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

export function truncate(str: string, maxLen: number, suffix = "…"): string {
    return str.length <= maxLen ? str : str.slice(0, maxLen - suffix.length) + suffix;
}
