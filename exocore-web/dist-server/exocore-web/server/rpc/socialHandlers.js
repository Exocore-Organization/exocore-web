"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocialHandlers = registerSocialHandlers;
const hub_1 = require("./hub");
const _helpers_1 = require("./_helpers");
const hub_2 = require("../social/hub");
function registerSocialHandlers() {
    // ------- Phase 4 — posts -------
    (0, hub_1.registerHandler)("posts.list", async (d) => {
        return await (0, _helpers_1.getBackend)("/exocore/api/posts", d || {});
    });
    (0, hub_1.registerHandler)("posts.profile", async (d) => {
        return await (0, _helpers_1.getBackend)("/exocore/api/posts/profile", d || {});
    });
    (0, hub_1.registerHandler)("posts.create", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const text = (0, _helpers_1.optString)(d?.text);
        const file = d?.file;
        const fields = { token, text };
        if (typeof d?.replyTo === "string")
            fields.replyTo = d.replyTo;
        if (typeof d?.visibility === "string")
            fields.visibility = d.visibility;
        const result = await (0, _helpers_1.postBackendForm)("/exocore/api/posts/create", fields, { file });
        if (result?.success)
            (0, hub_2.broadcastPostsUpdated)("create");
        return result;
    });
    (0, hub_1.registerHandler)("posts.delete", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const postId = (0, _helpers_1.requireString)(d?.postId, "postId");
        const result = await (0, _helpers_1.postBackend)("/exocore/api/posts/delete", { token, postId });
        if (result?.success)
            (0, hub_2.broadcastPostsUpdated)("delete");
        return result;
    });
    (0, hub_1.registerHandler)("posts.react", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const postId = (0, _helpers_1.requireString)(d?.postId, "postId");
        const emoji = (0, _helpers_1.requireString)(d?.emoji, "emoji");
        const result = await (0, _helpers_1.postBackend)("/exocore/api/posts/react", { token, postId, emoji });
        if (result?.success)
            (0, hub_2.broadcastPostsUpdated)("react");
        return result;
    });
    (0, hub_1.registerHandler)("posts.comment", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const postId = (0, _helpers_1.requireString)(d?.postId, "postId");
        const text = (0, _helpers_1.requireString)(d?.text, "text");
        const result = await (0, _helpers_1.postBackend)("/exocore/api/posts/comment", { token, postId, text });
        if (result?.success)
            (0, hub_2.broadcastPostsUpdated)("comment");
        return result;
    });
    (0, hub_1.registerHandler)("posts.comment.delete", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const postId = (0, _helpers_1.requireString)(d?.postId, "postId");
        const commentId = (0, _helpers_1.requireString)(d?.commentId, "commentId");
        const result = await (0, _helpers_1.postBackend)("/exocore/api/posts/comment/delete", { token, postId, commentId });
        if (result?.success)
            (0, hub_2.broadcastPostsUpdated)("comment-delete");
        return result;
    });
    // ------- Phase 4 — social proxies -------
    (0, hub_1.registerHandler)("social.friends", async (d) => {
        return await (0, _helpers_1.getBackend)("/exocore/api/social/friends", d || {});
    });
    (0, hub_1.registerHandler)("social.peer", async (d) => {
        return await (0, _helpers_1.getBackend)("/exocore/api/social/peer", d || {});
    });
    (0, hub_1.registerHandler)("social.pubkey", async (d) => {
        return await (0, _helpers_1.postBackend)("/exocore/api/social/pubkey", d || {});
    });
    (0, hub_1.registerHandler)("social.friend", async (d) => {
        return await (0, _helpers_1.postBackend)("/exocore/api/social/friend", d || {});
    });
    (0, hub_1.registerHandler)("social.avatars", async (d) => {
        return await (0, _helpers_1.getBackend)("/exocore/api/social/avatars", d || {});
    });
    // ------- Phase 4 — admin -------
    (0, hub_1.registerHandler)("admin.role", async (d) => {
        return await (0, _helpers_1.postBackend)("/exocore/api/admin/role", d || {});
    });
    (0, hub_1.registerHandler)("admin.ban", async (d) => {
        return await (0, _helpers_1.postBackend)("/exocore/api/admin/ban", d || {});
    });
    (0, hub_1.registerHandler)("admin.mute", async (d) => {
        return await (0, _helpers_1.postBackend)("/exocore/api/admin/mute", d || {});
    });
}
