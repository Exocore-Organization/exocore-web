"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REACTION_EMOJIS = void 0;
exports.addPost = addPost;
exports.listPostsByAuthor = listPostsByAuthor;
exports.listFeed = listFeed;
exports.getPost = getPost;
exports.softDeletePost = softDeletePost;
exports.addComment = addComment;
exports.toggleReaction = toggleReaction;
exports.deleteComment = deleteComment;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.REACTION_EMOJIS = ["like", "love", "haha", "wow", "sad", "angry"];
const DATA_DIR = path_1.default.join(__dirname, "../../local-db");
const FILE = path_1.default.join(DATA_DIR, "posts.json");
const RING_LIMIT = 5000;
const FLUSH_MS = 5000;
let buffer = [];
let loaded = false;
let dirty = false;
function ensureLoaded() {
    if (loaded)
        return;
    loaded = true;
    try {
        if (!fs_1.default.existsSync(DATA_DIR))
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        if (fs_1.default.existsSync(FILE)) {
            const raw = fs_1.default.readFileSync(FILE, "utf-8");
            const arr = JSON.parse(raw);
            if (Array.isArray(arr))
                buffer = arr.slice(-RING_LIMIT);
        }
    }
    catch (e) {
        console.warn("[postsStore] load failed:", e?.message);
    }
}
function persistSoon() { dirty = true; }
setInterval(() => {
    if (!dirty)
        return;
    dirty = false;
    try {
        if (!fs_1.default.existsSync(DATA_DIR))
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        fs_1.default.writeFileSync(FILE, JSON.stringify(buffer.slice(-RING_LIMIT)), { mode: 0o600 });
    }
    catch (e) {
        console.warn("[postsStore] persist failed:", e?.message);
    }
}, FLUSH_MS).unref?.();
function addPost(p) {
    ensureLoaded();
    buffer.push(p);
    if (buffer.length > RING_LIMIT)
        buffer = buffer.slice(-RING_LIMIT);
    persistSoon();
}
function listPostsByAuthor(author, limit = 50) {
    ensureLoaded();
    return buffer.filter(p => p.author === author && !p.deleted).slice(-limit).reverse();
}
function listFeed(limit = 60) {
    ensureLoaded();
    return buffer.filter(p => !p.deleted).slice(-limit).reverse();
}
function getPost(id) {
    ensureLoaded();
    return buffer.find(p => p.id === id);
}
function softDeletePost(id) {
    ensureLoaded();
    const p = buffer.find(x => x.id === id);
    if (!p || p.deleted)
        return false;
    p.deleted = true;
    p.text = "";
    persistSoon();
    return true;
}
function addComment(postId, c) {
    ensureLoaded();
    const p = buffer.find(x => x.id === postId);
    if (!p || p.deleted)
        return false;
    p.comments.push(c);
    if (p.comments.length > 500)
        p.comments = p.comments.slice(-500);
    persistSoon();
    return true;
}
function toggleReaction(postId, emoji, username) {
    ensureLoaded();
    const p = buffer.find(x => x.id === postId);
    if (!p || p.deleted)
        return null;
    if (!p.reactions)
        p.reactions = {};
    // Remove user from any existing reaction first.
    let prev = null;
    for (const k of Object.keys(p.reactions)) {
        const arr = p.reactions[k];
        const i = arr.indexOf(username);
        if (i >= 0) {
            prev = k;
            arr.splice(i, 1);
            if (arr.length === 0)
                delete p.reactions[k];
        }
    }
    // Toggle: if user clicked same one, leave it removed. Else add new.
    if (prev !== emoji) {
        if (!p.reactions[emoji])
            p.reactions[emoji] = [];
        p.reactions[emoji].push(username);
    }
    persistSoon();
    const mine = prev === emoji ? null : emoji;
    return { reactions: p.reactions, mine };
}
function deleteComment(postId, commentId) {
    ensureLoaded();
    const p = buffer.find(x => x.id === postId);
    if (!p)
        return false;
    const c = p.comments.find(x => x.id === commentId);
    if (!c || c.deleted)
        return false;
    c.deleted = true;
    c.text = "";
    persistSoon();
    return true;
}
