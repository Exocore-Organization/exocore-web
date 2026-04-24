const OPENAI_BASE = 'https://api.openai.com/v1';

export async function callChatGPT(
    model: string,
    apiKey: string,
    prompt: string,
): Promise<string> {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err?.error?.message ?? `OpenAI ${res.status}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? 'No response.';
}
