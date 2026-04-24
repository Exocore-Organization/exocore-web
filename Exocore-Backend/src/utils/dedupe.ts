import { getAllUsers, getUserFolder, deleteUserFolder, UserData } from "../services/drive";

/**
 * Scans cached users. For every email that appears more than once,
 * keeps the OLDEST account (lowest id / earliest createdAt) and queues
 * the rest for deletion (cache + Drive sync). Returns a summary.
 */
export async function dedupeUsersByEmail(): Promise<{
  scanned: number;
  duplicatesRemoved: number;
  removed: { email: string; username: string }[];
}> {
  const users = await getAllUsers();
  const records: { folderId: string; data: UserData }[] = [];
  for (const u of users) {
    if (!u.email) continue;
    const folderId = await getUserFolder(u.username);
    if (folderId) records.push({ folderId, data: u });
  }

  const groups = new Map<string, { folderId: string; data: UserData }[]>();
  for (const r of records) {
    const key = r.data.email.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const removed: { email: string; username: string }[] = [];

  for (const [email, list] of groups) {
    if (list.length <= 1) continue;
    list.sort((a, b) => {
      const ta = a.data.createdAt ?? a.data.id;
      const tb = b.data.createdAt ?? b.data.id;
      return ta - tb;
    });
    const toDelete = list.slice(1);
    for (const dup of toDelete) {
      try {
        await deleteUserFolder(dup.folderId);
        removed.push({ email, username: dup.data.username });
        console.log(`[dedupe] removed duplicate ${dup.data.username} (${email})`);
      } catch (e) {
        console.error(`[dedupe] failed to delete ${dup.data.username}:`, (e as Error).message);
      }
    }
  }

  return { scanned: records.length, duplicatesRemoved: removed.length, removed };
}
