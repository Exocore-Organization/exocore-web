const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

export async function callClaude(
    model: string,
    apiKey: string,
    prompt: string,
): Promise<string> {
    const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err?.error?.message ?? `Claude ${res.status}`);
    }

    const data = await res.json();
    return data?.content?.[0]?.text ?? 'No response.';
}
