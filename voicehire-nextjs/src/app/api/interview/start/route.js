// app/api/interview/start/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import Question from '@/models/Question';
import { verifyAuth } from '@/lib/auth';
import { callGemini, parseGeminiJSON } from '@/lib/gemini';
import { generateLocalQuestions } from '@/lib/fallback';

export async function POST(request) {
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    await connectDB();

    try {
        const { jobRole, experience, interviewType, topic, difficulty, numQuestions } = await request.json();

        // Validate required fields
        if (!jobRole || !interviewType || !difficulty || !numQuestions) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Missing required fields: jobRole, interviewType, difficulty, numQuestions',
                },
                { status: 400 }
            );
        }

        // 1. Generate questions — try Gemini first, fallback to local
        let questions;

        try {
            const topicLine = topic ? `Focus specifically on: ${topic}.` : '';
            const expLine = experience ? `Candidate experience level: ${experience}.` : '';

            const prompt = `You are Morgan Reid, a senior hiring manager. Generate exactly ${numQuestions} ${interviewType} interview questions for a ${difficulty}-level ${jobRole} candidate.
${expLine}
${topicLine}
Make questions sound natural and conversational, as a real interviewer would speak them. Be specific and progressively challenging.
Return ONLY a valid JSON array of strings. No explanation. No markdown.
Example: ["Tell me about yourself.", "Describe a recent challenge you overcame."]`;

            const raw = await callGemini(prompt, 0.8);
            questions = parseGeminiJSON(raw);
            if (!Array.isArray(questions)) throw new Error('Not an array');
            questions = questions.slice(0, numQuestions);
            console.log('✅ Questions generated via Gemini AI');
        } catch (geminiErr) {
            console.log('⚠️ Gemini unavailable, using built-in questions:', geminiErr.message);
            questions = generateLocalQuestions({ jobRole, interviewType, difficulty, numQuestions, topic });
        }

        // 2. Save interview to database
        const interview = await Interview.create({
            user_id: auth.user.id,
            job_role: jobRole,
            experience: experience || null,
            interview_type: interviewType,
            topic: topic || null,
            difficulty,
            num_questions: questions.length,
        });

        // 3. Save all questions
        const savedQuestions = await Promise.all(
            questions.map((q, i) =>
                Question.create({
                    interview_id: interview._id,
                    question_index: i,
                    question_text: q,
                })
            )
        );

        // 4. Return saved questions with IDs
        return NextResponse.json(
            {
                success: true,
                message: 'Interview started successfully',
                interviewId: interview._id,
                questions: savedQuestions.map((q) => ({
                    id: q._id,
                    question_index: q.question_index,
                    question_text: q.question_text,
                })),
            },
            { status: 201 }
        );
    } catch (err) {
        console.error('Start interview error:', err);
        return NextResponse.json(
            {
                success: false,
                message: err.message || 'Failed to start interview. Check your Gemini API key.',
            },
            { status: 500 }
        );
    }
}
