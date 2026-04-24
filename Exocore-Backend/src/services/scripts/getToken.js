#!/usr/bin/env node
// Usage:
//   node scripts/getToken.js               # paste JSON, then Ctrl+D
//   node scripts/getToken.js path/to.json  # read from file
//
// Encrypts an OAuth2 token JSON (e.g. the contents of token.json) and stores
// it as `local-db/token.enc` using the same double-layer encryption as the
// user database. The plaintext is NEVER written to disk by this tool.

const { pasteAndEncrypt } = require("./_secure");

pasteAndEncrypt({
  encName: "token.enc",
  label: "getToken",
  requiredKeys: ["access_token|refresh_token"],
}).catch(err => {
  console.error("[getToken] failed:", err.message);
  process.exit(1);
});
