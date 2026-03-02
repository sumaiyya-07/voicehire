// lib/gemini.js
// Central helper for calling Gemini API from the backend.
// Exact port of config/gemini.js from Express backend.

import fetch from 'node-fetch';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`;

const MAX_RETRIES = 3;

export async function callGemini(prompt, temperature = 0.7) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        throw new Error('Gemini API key not configured. Set GEMINI_API_KEY in your .env.local file.');
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature,
                    maxOutputTokens: 1500,
                },
            }),
        });

        // Handle rate limiting — wait and retry
        if (response.status === 429 && attempt < MAX_RETRIES) {
            const waitSec = Math.pow(2, attempt) * 5; // 10s, 20s
            console.log(`⏳ Rate limited. Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
            await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
            continue;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || `Gemini API error: ${response.status}`);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response from Gemini');

        return text;
    }

    throw new Error('Gemini API rate limit exceeded after retries. Please wait a minute and try again.');
}

// Strips markdown code fences and parses JSON safely
export function parseGeminiJSON(raw) {
    const clean = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    return JSON.parse(clean);
}
