// app/api/interview/start/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';
import { callGroq, parseGroqJSON } from '@/lib/groq';
import { generateLocalQuestions } from '@/lib/fallback';

export async function POST(request) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    try {
        const { jobRole, experience, interviewType, topic, difficulty, numQuestions } = await request.json();
        if (!jobRole || !interviewType || !difficulty || !numQuestions) {
            return NextResponse.json({ success: false, message: 'Missing required fields: jobRole, interviewType, difficulty, numQuestions' }, { status: 400 });
        }
        let questions;
        try {
            const topicLine = topic ? `Focus specifically on: ${topic}.` : '';
            const expLine = experience ? `Candidate experience level: ${experience}.` : '';
            const prompt = `You are Morgan Reid, a senior hiring manager. Generate exactly ${numQuestions} ${interviewType} interview questions for a ${difficulty}-level ${jobRole} candidate.\n${expLine}\n${topicLine}\nMake questions sound natural and conversational, as a real interviewer would speak them. Be specific and progressively challenging.\nReturn ONLY a valid JSON array of strings. No explanation. No markdown.\nExample: ["Tell me about yourself.", "Describe a recent challenge you overcame."]`;
            const raw = await callGroq(prompt, 0.8);
            questions = parseGroqJSON(raw);
            if (!Array.isArray(questions)) throw new Error('Not an array');
            questions = questions.slice(0, numQuestions);
            console.log('✅ Questions generated via Groq API');
        } catch (groqErr) {
            console.log('⚠️ Groq unavailable, using built-in questions:', groqErr.message);
            questions = generateLocalQuestions({ jobRole, interviewType, difficulty, numQuestions, topic });
        }
        const interview = await Interview.create({
            user: auth.user.id, jobRole, experience: experience || null, interviewType,
            topic: topic || null, difficulty, numQuestions: questions.length,
            questions: questions.map((q, i) => ({ questionIndex: i, questionText: q })),
        });
        return NextResponse.json({ success: true, message: 'Interview started successfully', interviewId: interview._id, questions: interview.questions.map((q) => ({ id: q._id, question_index: q.questionIndex, question_text: q.questionText })) }, { status: 201 });
    } catch (err) {
        console.error('Start interview error:', err);
        return NextResponse.json({ success: false, message: err.message || 'Failed to start interview.' }, { status: 500 });
    }
}
