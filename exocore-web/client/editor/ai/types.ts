export type AgentAction = {
    type: 'file_create' | 'file_edit' | 'file_delete' | 'terminal';
    target: string;
    status: 'pending' | 'executing' | 'done' | 'failed' | 'awaiting_confirm' | 'skipped';
    output?: string;
    showOutput?: boolean;
    content?: string; // payload for file_create, kept so we can retry/inspect
    existingContent?: string; // for file_create overwrites — what's currently on disk
    autoFixed?: boolean; // terminal: true once we've already triggered an auto-fix from this failure
    // file_edit (diff) payload — apply a small old → new replacement to the
    // existing file. Avoids re-sending the whole file when only a few lines
    // change. The patch must match `oldText` verbatim or the edit fails.
    oldText?: string;
    newText?: string;
};

export type Message = {
    id: string;
    role: 'user' | 'ai';
    text?: string;
    steps?: string[];
    actions?: AgentAction[];
    images?: string[];
    isGenerating?: boolean;
    provider?: 'exocore' | 'kilo' | 'rest';
    kind?: 'chat' | 'image' | 'agent';
};

export interface RestPreset {
    id: string;
    name: string;
    endpoint: string;
    queryParam: string;
    dataPath: string;
}

export type AiMode = 'exocore' | 'kilo' | 'rest';

/* Meta AI / Llama via the exocore-llama Flask bridge. The remote service
 * picks the model server-side, so only one entry is exposed. */
export const META_MODELS = [
    { id: 'meta-ai-default', name: 'Llama via exocore-llama.hf.space' },
];

/* Kept as empty placeholders so legacy imports don't break the build. */
export const GEMINI_MODELS: { id: string; name: string }[] = [];
export const OPENAI_MODELS: { id: string; name: string }[] = [];
export const CLAUDE_MODELS: { id: string; name: string }[] = [];
