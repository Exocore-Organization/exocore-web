const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function callGemini(
    model: string,
    apiKey: string,
    prompt: string,
): Promise<string> {
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err?.error?.message ?? `Gemini ${res.status}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.';
}
