import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { get, set } from "idb-keyval";

const PRIV_KEY_IDB = "exo_x25519_priv_v1";

function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface KeyPair { priv: Uint8Array; pub: Uint8Array; }

export async function ensureKeyPair(): Promise<KeyPair> {
  const stored = await get<string>(PRIV_KEY_IDB);
  if (stored) {
    try {
      const priv = b64ToBytes(stored);
      if (priv.length === 32) {
        const pub = x25519.getPublicKey(priv);
        return { priv, pub };
      }
    } catch {}
  }
  const priv = x25519.utils.randomSecretKey();
  const pub = x25519.getPublicKey(priv);
  await set(PRIV_KEY_IDB, bytesToB64(priv));
  return { priv, pub };
}

export function pubKeyB64(kp: KeyPair): string { return bytesToB64(kp.pub); }

function deriveKey(myPriv: Uint8Array, peerPub: Uint8Array, info = "exo-dm-v1"): Uint8Array {
  const shared = x25519.getSharedSecret(myPriv, peerPub);
  return hkdf(sha256, shared, new Uint8Array(32), new TextEncoder().encode(info), 32);
}

export interface SealedDM { ciphertext: string; nonce: string; }

export function sealForPeer(myPriv: Uint8Array, peerPubB64: string, plaintext: string): SealedDM {
  const peerPub = b64ToBytes(peerPubB64);
  const key = deriveKey(myPriv, peerPub);
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const ct = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  return { ciphertext: bytesToB64(ct), nonce: bytesToB64(nonce) };
}

export function openFromPeer(myPriv: Uint8Array, peerPubB64: string, ciphertextB64: string, nonceB64: string): string | null {
  try {
    const peerPub = b64ToBytes(peerPubB64);
    const key = deriveKey(myPriv, peerPub);
    const nonce = b64ToBytes(nonceB64);
    const pt = xchacha20poly1305(key, nonce).decrypt(b64ToBytes(ciphertextB64));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
