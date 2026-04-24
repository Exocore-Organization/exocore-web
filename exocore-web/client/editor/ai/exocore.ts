/* Client-side helper for the Exocore Llama bridge.
 *
 * All chat / image / agent calls go through the WSS RPC hub
 * (ai.meta*) which forwards to:
 *
 *   https://exocore-llama.hf.space/
 */
import { rpc } from '../../access/rpcClient';

const BASE_URL = 'https://exocore-llama.hf.space';

export async function callExocore(prompt: string): Promise<string> {
    const data = await rpc.call<any>('ai.meta', { prompt }, { timeoutMs: 95000 });
    if (!data?.ok) throw new Error(data?.detail || data?.error || 'request failed');
    return data.reply ?? '';
}

export const EXOCORE_LLAMA_URL = BASE_URL;
