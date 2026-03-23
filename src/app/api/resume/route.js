// app/api/resume/route.js
// Resume Analyzer API — uses Groq to analyze a resume for a target job role.

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { callGroq, parseGroqJSON } from '@/lib/groq';

export async function POST(request) {
    // Auth check
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { resumeText, jobRole } = body;

    if (!resumeText || resumeText.trim().length < 50) {
        return NextResponse.json(
            { success: false, message: 'Resume text is too short. Please paste your full resume (at least 50 characters).' },
            { status: 400 }
        );
    }

    if (!jobRole || jobRole.trim().length < 2) {
        return NextResponse.json(
            { success: false, message: 'Please specify a target job role.' },
            { status: 400 }
        );
    }

    const prompt = `You are an expert ATS (Applicant Tracking System) and career coach. Analyze the following resume for the target job role and provide structured, actionable feedback.

TARGET JOB ROLE: ${jobRole.trim()}

RESUME TEXT:
"""
${resumeText.trim().slice(0, 4000)}
"""

Respond ONLY with a valid JSON object (no markdown, no extra text) in this exact format:
{
  "atsScore": <integer 0-100 representing ATS compatibility score>,
  "summary": "<one paragraph overall assessment, 2-3 sentences>",
  "strengths": [
    "<specific strength from the resume relevant to the role>",
    "<another strength>",
    "<another strength>"
  ],
  "gaps": [
    "<specific gap or missing skill for the target role>",
    "<another gap>"
  ],
  "suggestions": [
    "<specific actionable improvement suggestion>",
    "<another suggestion>",
    "<another suggestion>"
  ],
  "keywordsFound": [
    "<important keyword found in the resume relevant to the role>",
    "<another keyword>"
  ],
  "keywordsMissing": [
    "<important keyword missing from the resume that is expected for this role>",
    "<another missing keyword>"
  ],
  "experienceLevel": "<one of: Entry Level, Mid Level, Senior Level, Executive>",
  "formattingScore": <integer 0-10 for resume formatting quality>,
  "contentScore": <integer 0-10 for content quality and relevance>
}

Be specific, constructive, and tailored to the exact job role provided. Strengths, gaps, suggestions, keywordsFound, and keywordsMissing should each have 3-6 items.`;

    try {
        const raw = await callGroq(prompt, 0.3);
        let result;
        try {
            result = parseGroqJSON(raw);
        } catch {
            // If JSON parse fails, return a graceful error
            return NextResponse.json(
                { success: false, message: 'AI returned an unexpected response. Please try again.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, analysis: result });
    } catch (err) {
        return NextResponse.json({ success: false, message: err.message || 'Resume analysis failed.' }, { status: 500 });
    }
}
