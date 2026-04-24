"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOT_PARENT = exports.drive = void 0;
exports.bufferToStream = bufferToStream;
exports.getOrCreateFolder = getOrCreateFolder;
exports.getUsersFolderId = getUsersFolderId;
exports.uploadImagePublic = uploadImagePublic;
exports.restoreFromDrive = restoreFromDrive;
exports.syncDirtyToDrive = syncDirtyToDrive;
exports.startBackgroundSync = startBackgroundSync;
exports.initLocalCache = initLocalCache;
exports.getUserFolder = getUserFolder;
exports.getUserDbFileId = getUserDbFileId;
exports.readUserDb = readUserDb;
exports.writeUserDb = writeUserDb;
exports.deleteUserFolder = deleteUserFolder;
exports.registerUserToDrive = registerUserToDrive;
exports.getAllUsers = getAllUsers;
exports.getProfileImages = getProfileImages;
exports.isCacheReady = isCacheReady;
const googleapis_1 = require("googleapis");
const stream_1 = require("stream");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const secureStore_1 = require("./secureStore");
const credStore_1 = require("./credStore");
const PROJECT_ROOT = path_1.default.join(__dirname, "../..");
const LOCAL_DB_DIR = path_1.default.join(PROJECT_ROOT, "local-db");
// Find any legacy `client_secret_*.json` if present (before migration).
function findClientSecretLegacy() {
    try {
        return fs_1.default.readdirSync(PROJECT_ROOT)
            .filter(f => f.startsWith("client_secret_") && f.endsWith(".json"))
            .map(f => path_1.default.join(PROJECT_ROOT, f));
    }
    catch {
        return [];
    }
}
function findServiceAccountLegacy() {
    try {
        return fs_1.default.readdirSync(PROJECT_ROOT)
            .filter(f => /^exocore-database.*\.json$/.test(f))
            .map(f => path_1.default.join(PROJECT_ROOT, f));
    }
    catch {
        return [];
    }
}
const credentials = (0, credStore_1.loadEncryptedJson)({
    localDir: LOCAL_DB_DIR,
    encName: "client_secret.enc",
    legacyPaths: findClientSecretLegacy(),
});
const token = (0, credStore_1.loadEncryptedJson)({
    localDir: LOCAL_DB_DIR,
    encName: "token.enc",
    legacyPaths: [path_1.default.join(PROJECT_ROOT, "token.json")],
});
// Optional service-account credential (not required by the OAuth flow but
// migrated/encrypted so it never sits as plaintext on disk).
try {
    (0, credStore_1.loadEncryptedJson)({
        localDir: LOCAL_DB_DIR,
        encName: "service_account.enc",
        legacyPaths: findServiceAccountLegacy(),
    });
}
catch { /* optional */ }
const installed = credentials.installed || credentials.web;
const oAuth2Client = new googleapis_1.google.auth.OAuth2(installed.client_id, installed.client_secret, installed.redirect_uris[0]);
oAuth2Client.setCredentials(token);
exports.drive = googleapis_1.google.drive({ version: "v3", auth: oAuth2Client });
exports.ROOT_PARENT = "101XiYAWaQf4AALw77KbpMT6o4GtlmZGJ";
function bufferToStream(buffer) {
    const s = new stream_1.Readable();
    s.push(buffer);
    s.push(null);
    return s;
}
async function getOrCreateFolder(name, parentId) {
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId)
        q += ` and '${parentId}' in parents`;
    const res = await exports.drive.files.list({ q, fields: "files(id, name)" });
    if (res.data.files && res.data.files.length > 0)
        return res.data.files[0].id;
    const created = await exports.drive.files.create({
        requestBody: {
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: parentId ? [parentId] : [],
        },
        fields: "id",
    });
    return created.data.id;
}
async function getUsersFolderId() {
    const root = await getOrCreateFolder("EXOCORE", exports.ROOT_PARENT);
    const cli = await getOrCreateFolder("exocore-cli", root);
    return await getOrCreateFolder("users", cli);
}
async function uploadImagePublic(folderId, name, buffer) {
    if (!buffer)
        return null;
    const created = await exports.drive.files.create({
        requestBody: { name, parents: [folderId] },
        media: { mimeType: "image/png", body: bufferToStream(buffer) },
        fields: "id",
    });
    const fileId = created.data.id;
    await exports.drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" },
    });
    return fileId;
}
const LOCAL_DIR = path_1.default.join(__dirname, "../../local-db");
// Encrypted at rest: AES-256-GCM ⊕ XChaCha20-Poly1305. Plain JSON is never
// written to disk. The legacy `users.json` file is migrated + deleted on boot.
const LOCAL_FILE = path_1.default.join(LOCAL_DIR, "users.enc");
const LEGACY_FILE = path_1.default.join(LOCAL_DIR, "users.json");
const cache = new Map(); // by username
const folderIndex = new Map(); // folderId -> username
let restored = false;
let secure = null;
function ensureLocalDir() {
    if (!fs_1.default.existsSync(LOCAL_DIR))
        fs_1.default.mkdirSync(LOCAL_DIR, { recursive: true });
}
function getSecure() {
    if (!secure) {
        ensureLocalDir();
        secure = new secureStore_1.SecureStore(LOCAL_DIR);
    }
    return secure;
}
function persistLocalSync() {
    try {
        ensureLocalDir();
        const obj = {};
        for (const [k, v] of cache)
            obj[k] = v;
        const blob = getSecure().encrypt(JSON.stringify(obj));
        fs_1.default.writeFileSync(LOCAL_FILE, blob, { mode: 0o600 });
    }
    catch (e) {
        console.error("[cache] persistLocal failed:", e?.message);
    }
}
function loadLocalSync() {
    try {
        // Migrate legacy plaintext snapshot if present, then remove it.
        if (fs_1.default.existsSync(LEGACY_FILE)) {
            try {
                const raw = fs_1.default.readFileSync(LEGACY_FILE, "utf-8");
                const obj = JSON.parse(raw);
                for (const [k, v] of Object.entries(obj)) {
                    cache.set(k, v);
                    if (v.folderId)
                        folderIndex.set(v.folderId, k);
                }
                persistLocalSync();
                fs_1.default.unlinkSync(LEGACY_FILE);
                console.log(`[cache] migrated ${cache.size} users from legacy plaintext snapshot → encrypted`);
            }
            catch (e) {
                console.error("[cache] legacy migration failed:", e?.message);
            }
        }
        if (!fs_1.default.existsSync(LOCAL_FILE))
            return;
        const blob = fs_1.default.readFileSync(LOCAL_FILE);
        const json = getSecure().decrypt(blob);
        const obj = JSON.parse(json);
        cache.clear();
        folderIndex.clear();
        for (const [k, v] of Object.entries(obj)) {
            cache.set(k, v);
            if (v.folderId)
                folderIndex.set(v.folderId, k);
        }
        console.log(`[cache] loaded ${cache.size} users from encrypted local snapshot`);
    }
    catch (e) {
        console.error("[cache] loadLocal failed:", e?.message);
    }
}
function setEntry(entry) {
    cache.set(entry.data.username, entry);
    folderIndex.set(entry.folderId, entry.data.username);
}
function findByFolderId(folderId) {
    const username = folderIndex.get(folderId);
    if (!username)
        return undefined;
    return cache.get(username);
}
async function restoreFromDrive() {
    console.log("[cache] restoring from Drive…");
    const t0 = Date.now();
    try {
        const usersFolderId = await getUsersFolderId();
        const folderRes = await exports.drive.files.list({
            q: `'${usersFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "files(id, name)",
            pageSize: 1000,
        });
        const fresh = new Map();
        const freshIndex = new Map();
        for (const folder of folderRes.data.files ?? []) {
            try {
                const dbList = await exports.drive.files.list({
                    q: `'${folder.id}' in parents and name = 'database.json' and trashed = false`,
                    fields: "files(id)",
                });
                const fileId = dbList.data.files?.[0]?.id;
                if (!fileId)
                    continue;
                const r = await exports.drive.files.get({ fileId, alt: "media" });
                const data = r.data;
                if (!data?.username)
                    continue;
                fresh.set(data.username, { folderId: folder.id, data });
                freshIndex.set(folder.id, data.username);
            }
            catch (e) {
                console.error(`[cache] failed to load ${folder.name}:`, e?.message);
            }
        }
        // Preserve any locally-dirty entries that haven't synced yet.
        for (const [username, entry] of cache) {
            if (entry.dirty || entry.pendingCreate || entry.pendingDelete) {
                fresh.set(username, entry);
                if (entry.folderId)
                    freshIndex.set(entry.folderId, username);
            }
        }
        cache.clear();
        folderIndex.clear();
        for (const [k, v] of fresh)
            cache.set(k, v);
        for (const [k, v] of freshIndex)
            folderIndex.set(k, v);
        persistLocalSync();
        restored = true;
        console.log(`[cache] restored ${cache.size} users in ${Date.now() - t0}ms`);
    }
    catch (e) {
        console.error("[cache] restoreFromDrive failed:", e?.message);
    }
}
async function flushEntry(entry) {
    if (entry.pendingDelete) {
        try {
            await exports.drive.files.delete({ fileId: entry.folderId });
        }
        catch (e) {
            // Folder may already be gone; ignore 404s.
            if (e?.code !== 404)
                throw e;
        }
        cache.delete(entry.data.username);
        cache.delete(`__deleted__:${entry.folderId}`);
        folderIndex.delete(entry.folderId);
        return;
    }
    if (entry.pendingCreate) {
        const usersFolderId = await getUsersFolderId();
        const folderName = entry.data.username.replace(/@/g, "");
        const folderId = await getOrCreateFolder(folderName, usersFolderId);
        folderIndex.delete(entry.folderId);
        entry.folderId = folderId;
        folderIndex.set(folderId, entry.data.username);
        await exports.drive.files.create({
            requestBody: { name: "database.json", parents: [folderId] },
            media: { mimeType: "application/json", body: JSON.stringify(entry.data, null, 2) },
        });
        entry.pendingCreate = false;
        entry.dirty = false;
        return;
    }
    if (entry.pendingFolderRename) {
        const newName = entry.pendingFolderRename;
        await exports.drive.files.update({ fileId: entry.folderId, requestBody: { name: newName } });
        entry.pendingFolderRename = undefined;
    }
    // Update database.json
    const list = await exports.drive.files.list({
        q: `'${entry.folderId}' in parents and name = 'database.json' and trashed = false`,
        fields: "files(id)",
    });
    const fileId = list.data.files?.[0]?.id;
    if (!fileId) {
        await exports.drive.files.create({
            requestBody: { name: "database.json", parents: [entry.folderId] },
            media: { mimeType: "application/json", body: JSON.stringify(entry.data, null, 2) },
        });
    }
    else {
        await exports.drive.files.update({
            fileId,
            media: { mimeType: "application/json", body: JSON.stringify(entry.data, null, 2) },
        });
    }
    entry.dirty = false;
}
let syncing = false;
async function syncDirtyToDrive() {
    if (syncing)
        return;
    syncing = true;
    try {
        const dirty = Array.from(cache.values()).filter(e => e.dirty || e.pendingCreate || e.pendingDelete || e.pendingFolderRename);
        if (dirty.length === 0)
            return;
        console.log(`[sync] flushing ${dirty.length} dirty user(s) → Drive`);
        for (const entry of dirty) {
            try {
                await flushEntry(entry);
            }
            catch (e) {
                console.error(`[sync] failed for ${entry.data.username}:`, e?.message);
            }
        }
        persistLocalSync();
    }
    finally {
        syncing = false;
    }
}
let syncTimer = null;
function startBackgroundSync(intervalMs = 60_000) {
    if (syncTimer)
        return;
    syncTimer = setInterval(() => {
        syncDirtyToDrive().catch(e => console.error("[sync] tick failed:", e?.message));
    }, intervalMs);
    console.log(`[sync] background sync started (every ${intervalMs}ms)`);
}
async function initLocalCache() {
    ensureLocalDir();
    loadLocalSync();
    await restoreFromDrive();
    startBackgroundSync(60_000);
}
// ============================================================================
// CACHE-BACKED PUBLIC API (drop-in replacements for the original Drive funcs)
// ============================================================================
async function getUserFolder(username) {
    const entry = cache.get(username);
    return entry ? entry.folderId : null;
}
async function getUserDbFileId(folderId) {
    // Kept for backward-compat. Looks up the live Drive id (rare path).
    const res = await exports.drive.files.list({
        q: `'${folderId}' in parents and name = 'database.json' and trashed = false`,
        fields: "files(id)",
    });
    return res.data.files?.[0]?.id ?? null;
}
async function readUserDb(folderId) {
    const entry = findByFolderId(folderId);
    return entry ? { ...entry.data } : null;
}
async function writeUserDb(folderId, data) {
    let entry = findByFolderId(folderId);
    if (!entry) {
        entry = { folderId, data, dirty: true };
        setEntry(entry);
    }
    else {
        const oldUsername = entry.data.username;
        entry.data = data;
        entry.dirty = true;
        if (oldUsername !== data.username) {
            cache.delete(oldUsername);
        }
        setEntry(entry);
    }
    persistLocalSync();
}
async function deleteUserFolder(folderId) {
    const entry = findByFolderId(folderId);
    if (entry) {
        // Mark for Drive deletion in the background sync, AND remove from the
        // live in-memory index immediately so the user truly disappears from
        // login/userinfo right away (don't wait for the next 60s tick).
        entry.pendingDelete = true;
        cache.delete(entry.data.username);
        folderIndex.delete(entry.folderId);
        // Re-insert under a hidden tombstone key so the sync loop can still find
        // it and complete the Drive-side delete.
        cache.set(`__deleted__:${entry.folderId}`, entry);
        // Defer disk persist + Drive sync to the next tick so the HTTP response
        // returns immediately (encryption + Drive call can be slow).
        setImmediate(() => {
            try {
                persistLocalSync();
            }
            catch { }
            syncDirtyToDrive().catch(() => { });
        });
    }
    else {
        // Not in cache; delete directly.
        try {
            await exports.drive.files.delete({ fileId: folderId });
        }
        catch (e) {
            if (e?.code !== 404)
                throw e;
        }
    }
}
async function registerUserToDrive(userData, avatarBuffer, coverBuffer) {
    // Reject duplicates locally first.
    if (cache.has(userData.username)) {
        throw new Error("ALREADY_EXISTS");
    }
    // Stage in cache immediately so subsequent reads see the new user.
    // We don't have a real folderId yet — use a placeholder that will be
    // replaced once the background sync creates the Drive folder.
    const placeholderFolderId = `pending:${userData.username}:${Date.now()}`;
    setEntry({
        folderId: placeholderFolderId,
        data: userData,
        dirty: true,
        pendingCreate: true,
    });
    persistLocalSync();
    // Best-effort: upload avatar / cover synchronously when provided. They are
    // attached to the real Drive folder once the background sync creates it.
    if (avatarBuffer || coverBuffer) {
        (async () => {
            // Wait briefly for the folder to be materialised on Drive.
            for (let i = 0; i < 30; i++) {
                const e = cache.get(userData.username);
                if (e && !e.pendingCreate && !e.folderId.startsWith("pending:")) {
                    try {
                        if (avatarBuffer)
                            await uploadImagePublic(e.folderId, "avatar.png", avatarBuffer);
                        if (coverBuffer)
                            await uploadImagePublic(e.folderId, "cover.png", coverBuffer);
                    }
                    catch (err) {
                        console.error("[register] image upload failed:", err?.message);
                    }
                    return;
                }
                await new Promise(r => setTimeout(r, 2000));
            }
            console.warn(`[register] image upload skipped — folder for ${userData.username} not synced in time`);
        })();
    }
    // Kick the sync immediately (don't await — caller stays fast).
    syncDirtyToDrive().catch(() => { });
    return { success: true };
}
async function getAllUsers() {
    const out = [];
    for (const entry of cache.values()) {
        if (entry.pendingDelete)
            continue;
        out.push({ ...entry.data });
    }
    return out;
}
async function getProfileImages(folderId) {
    // Image lookups still hit Drive directly (we don't cache binary assets).
    if (folderId.startsWith("pending:")) {
        return { avatarUrl: null, coverUrl: null };
    }
    try {
        const res = await exports.drive.files.list({
            q: `'${folderId}' in parents and (name = 'avatar.png' or name = 'cover.png') and trashed = false`,
            fields: "files(id, name)",
        });
        const out = { avatarUrl: null, coverUrl: null };
        for (const f of res.data.files ?? []) {
            const url = `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`;
            if (f.name === "avatar.png")
                out.avatarUrl = url;
            if (f.name === "cover.png")
                out.coverUrl = url;
        }
        return out;
    }
    catch (e) {
        console.error("[drive] getProfileImages failed:", e?.message);
        return { avatarUrl: null, coverUrl: null };
    }
}
function isCacheReady() {
    return restored;
}
