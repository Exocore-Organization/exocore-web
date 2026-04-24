#!/usr/bin/env node
// Usage:
//   node scripts/getClient.js               # paste JSON, then Ctrl+D
//   node scripts/getClient.js path/to.json  # read from file
//
// Encrypts a Google OAuth2 client-secret JSON (the file you download from
// Google Cloud Console — `client_secret_*.json`) and stores it as
// `local-db/client_secret.enc` using the same double-layer encryption as
// the user database. The plaintext is NEVER written to disk by this tool.

const { pasteAndEncrypt } = require("./_secure");

pasteAndEncrypt({
  encName: "client_secret.enc",
  label: "getClient",
  requiredKeys: ["installed.client_id|web.client_id"],
}).catch(err => {
  console.error("[getClient] failed:", err.message);
  process.exit(1);
});
