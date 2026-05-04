import type { User, UserSummary, EventKey, EventPayload } from "./types";
import { ok, err, unwrap, groupBy, retry, formatDate, truncate, sleep } from "./utils";

// ─── Optional chaining & nullish coalescing ───────────────────────────────
const config = {
    app: { name: "Exocore TS", version: "1.0.0" },
    db: null as { host: string } | null,
};

const appName  = config.app?.name ?? "Unknown App";
const dbHost   = config.db?.host   ?? "localhost";

console.log(`\n🚀 ${appName}  (db: ${dbHost})`);

// ─── Discriminated union + Result<T> ────────────────────────────────────
function parsePort(raw: unknown) {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 && n < 65536
        ? ok(n)
        : err(new RangeError(`Invalid port: ${raw}`));
}

const portResult = parsePort(process.env["PORT"] ?? 3000);
const port = unwrap(portResult);
console.log(`   Port → ${port}`);

// ─── Generics + satisfies ────────────────────────────────────────────────
const MOCK_USERS = [
    { id: 1, name: "Alice",   email: "alice@example.com", role: "admin",  createdAt: new Date("2024-01-15"), metadata: { tier: "pro"  } },
    { id: 2, name: "Bob",     email: "bob@example.com",   role: "editor", createdAt: new Date("2024-03-10") },
    { id: 3, name: "Carol",   email: "carol@example.com", role: "viewer", createdAt: new Date("2024-05-22") },
    { id: 4, name: "Dave",    email: "dave@example.com",  role: "editor", createdAt: new Date("2024-06-01") },
    { id: 5, name: "Erin",    email: "erin@example.com",  role: "admin",  createdAt: new Date("2025-01-08") },
] satisfies User[];

// ─── Array ESNext methods ────────────────────────────────────────────────
const lastUser    = MOCK_USERS.at(-1);
const firstAdmin  = MOCK_USERS.find((u) => u.role === "admin");

console.log(`\n👤 Users (${MOCK_USERS.length} total)`);
console.log(`   First admin : ${firstAdmin?.name ?? "none"}`);
console.log(`   Last user   : ${lastUser?.name ?? "none"}`);

// ─── groupBy + Object.entries ────────────────────────────────────────────
const byRole = groupBy(MOCK_USERS, (u) => u.role);
console.log("\n📊 By role:");
for (const [role, users] of Object.entries(byRole)) {
    const names = users.map((u) => u.name).join(", ");
    console.log(`   ${role.padEnd(8)} → ${names}`);
}

// ─── Type-safe minimal event emitter ────────────────────────────────────
type Listener<K extends EventKey> = (payload: EventPayload<K>) => void;
type AnyListener = Listener<EventKey>;

class TypedEmitter {
    #listeners = new Map<string, AnyListener[]>();

    on<K extends EventKey>(event: K, listener: Listener<K>): this {
        (this.#listeners.get(event) ?? (this.#listeners.set(event, []), this.#listeners.get(event)!)).push(listener as AnyListener);
        return this;
    }

    emit<K extends EventKey>(event: K, payload: EventPayload<K>): void {
        this.#listeners.get(event)?.forEach((fn) => fn(payload as never));
    }
}

const emitter = new TypedEmitter();

emitter.on("user:created", (user) => {
    const summary: UserSummary = { id: user.id, name: user.name, role: user.role };
    console.log(`\n✨ user:created → #${summary.id} ${summary.name} (${summary.role})`);
});

emitter.on("app:ready", ({ timestamp }) => {
    console.log(`   app:ready   @ ${formatDate(timestamp)}`);
});

// ─── structuredClone + deep mutation safety ──────────────────────────────
const original = MOCK_USERS[0]!;
const clone    = structuredClone(original);
clone.metadata = { tier: "free" };
console.log(`\n🔁 Clone mutated (original unchanged): tier=${original.metadata?.["tier"] ?? "–"}`);

// ─── Async / await + Promise.allSettled ─────────────────────────────────
async function fetchUser(id: number): Promise<User> {
    await sleep(10);
    const user = MOCK_USERS.find((u) => u.id === id);
    if (!user) throw new Error(`User ${id} not found`);
    return user;
}

async function main(): Promise<void> {
    const results = await Promise.allSettled([
        fetchUser(1),
        fetchUser(99),
        retry(() => fetchUser(3), 2),
    ]);

    console.log("\n🔄 Promise.allSettled results:");
    for (const r of results) {
        if (r.status === "fulfilled") {
            console.log(`   ✓ ${r.value.name}`);
        } else {
            console.log(`   ✗ ${truncate(String(r.reason), 50)}`);
        }
    }

    // Emit events
    emitter.emit("user:created", MOCK_USERS[2]!);
    emitter.emit("app:ready", { timestamp: new Date() });

    console.log("\n✅ TypeScript ESNext template is working correctly.\n");
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
