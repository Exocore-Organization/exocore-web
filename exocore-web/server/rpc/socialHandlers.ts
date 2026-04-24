import { registerHandler } from "./hub";
import {
    getBackend,
    postBackend,
    postBackendForm,
    requireString,
    optString,
    RpcFile,
} from "./_helpers";
import { broadcastPostsUpdated } from "../social/hub";

export function registerSocialHandlers(): void {
    // ------- Phase 4 — posts -------
    registerHandler("posts.list", async (d) => {
        return await getBackend("/exocore/api/posts", d || {});
    });
    registerHandler("posts.profile", async (d) => {
        return await getBackend("/exocore/api/posts/profile", d || {});
    });
    registerHandler("posts.create", async (d) => {
        const token = requireString(d?.token, "token");
        const text = optString(d?.text);
        const file = d?.file as RpcFile | undefined;
        const fields: Record<string, string> = { token, text };
        if (typeof d?.replyTo === "string") fields.replyTo = d.replyTo;
        if (typeof d?.visibility === "string") fields.visibility = d.visibility;
        const result = await postBackendForm(
            "/exocore/api/posts/create",
            fields,
            { file },
        );
        if (result?.success) broadcastPostsUpdated("create");
        return result;
    });
    registerHandler("posts.delete", async (d) => {
        const token = requireString(d?.token, "token");
        const postId = requireString(d?.postId, "postId");
        const result = await postBackend("/exocore/api/posts/delete", { token, postId });
        if (result?.success) broadcastPostsUpdated("delete");
        return result;
    });
    registerHandler("posts.react", async (d) => {
        const token = requireString(d?.token, "token");
        const postId = requireString(d?.postId, "postId");
        const emoji = requireString(d?.emoji, "emoji");
        const result = await postBackend("/exocore/api/posts/react", { token, postId, emoji });
        if (result?.success) broadcastPostsUpdated("react");
        return result;
    });
    registerHandler("posts.comment", async (d) => {
        const token = requireString(d?.token, "token");
        const postId = requireString(d?.postId, "postId");
        const text = requireString(d?.text, "text");
        const result = await postBackend("/exocore/api/posts/comment", { token, postId, text });
        if (result?.success) broadcastPostsUpdated("comment");
        return result;
    });
    registerHandler("posts.comment.delete", async (d) => {
        const token = requireString(d?.token, "token");
        const postId = requireString(d?.postId, "postId");
        const commentId = requireString(d?.commentId, "commentId");
        const result = await postBackend("/exocore/api/posts/comment/delete", { token, postId, commentId });
        if (result?.success) broadcastPostsUpdated("comment-delete");
        return result;
    });

    // ------- Phase 4 — social proxies -------
    registerHandler("social.friends", async (d) => {
        return await getBackend("/exocore/api/social/friends", d || {});
    });
    registerHandler("social.peer", async (d) => {
        return await getBackend("/exocore/api/social/peer", d || {});
    });
    registerHandler("social.pubkey", async (d) => {
        return await postBackend("/exocore/api/social/pubkey", d || {});
    });
    registerHandler("social.friend", async (d) => {
        return await postBackend("/exocore/api/social/friend", d || {});
    });
    registerHandler("social.avatars", async (d) => {
        return await getBackend("/exocore/api/social/avatars", d || {});
    });

    // ------- Phase 4 — admin -------
    registerHandler("admin.role", async (d) => {
        return await postBackend("/exocore/api/admin/role", d || {});
    });
    registerHandler("admin.ban", async (d) => {
        return await postBackend("/exocore/api/admin/ban", d || {});
    });
    registerHandler("admin.mute", async (d) => {
        return await postBackend("/exocore/api/admin/mute", d || {});
    });
}
