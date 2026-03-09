// lib/groq.js
// Central helper for calling Groq API from Next.js API routes.

import Groq from 'groq-sdk';

const MAX_RETRIES = 3;

export async function callGroq(prompt, temperature = 0.7) {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey || apiKey === 'your_key_here') {
        throw new Error('Groq API key not configured. Set GROQ_API_KEY in your .env.local file.');
    }

    const groq = new Groq({ apiKey });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature,
                max_tokens: 1500,
            });

            const text = response.choices?.[0]?.message?.content;
            if (!text) throw new Error('Empty response from Groq');

            return text;
        } catch (error) {
            // Check for rate limit
            if (error.status === 429 && attempt < MAX_RETRIES) {
                const waitSec = Math.pow(2, attempt) * 5;
                console.log(`⏳ Rate limited. Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
                await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
                continue;
            }
            throw new Error(error.message || `Groq API error`);
        }
    }

    throw new Error('Groq API rate limit exceeded after retries. Please wait a minute and try again.');
}

export function parseGroqJSON(raw) {
    const clean = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
    return JSON.parse(clean);
}
