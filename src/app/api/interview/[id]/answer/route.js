// app/api/interview/[id]/answer/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';
import { callGemini, parseGeminiJSON } from '@/lib/gemini';
import { evaluateAnswerLocally } from '@/lib/fallback';

export async function POST(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    const { id: interviewId } = await params;
    const { questionId, answerText } = await request.json();
    if (!questionId || !answerText || answerText.trim().length < 5) {
        return NextResponse.json({ success: false, message: 'questionId and answerText (min 5 chars) are required.' }, { status: 400 });
    }
    try {
        const interview = await Interview.findOne({ _id: interviewId, user: auth.user.id });
        if (!interview) return NextResponse.json({ success: false, message: 'Interview not found.' }, { status: 404 });
        const question = interview.questions.id(questionId);
        if (!question) return NextResponse.json({ success: false, message: 'Question not found.' }, { status: 404 });
        const prompt = `You are evaluating a candidate's answer in a ${interview.difficulty} ${interview.interviewType} interview for a ${interview.jobRole} role.\n\nQuestion: "${question.questionText}"\nCandidate's answer: "${answerText}"\n\nReturn ONLY a valid JSON object. No markdown. No explanation:\n{\n  "score": <integer 0 to 100>,\n  "positive": "<one specific strength of this answer in 1-2 sentences>",\n  "improve": "<one specific actionable improvement in 1-2 sentences>",\n  "brief": "<one sentence overall verdict, spoken aloud to the candidate>"\n}`;
        let feedback;
        try {
            const raw = await callGemini(prompt, 0.5);
            feedback = parseGeminiJSON(raw);
        } catch (e) {
            feedback = evaluateAnswerLocally(question.questionText, answerText, interview.difficulty);
        }
        question.answer = { answerText, score: feedback.score, positive: feedback.positive, improve: feedback.improve, brief: feedback.brief };
        await interview.save();
        return NextResponse.json({ success: true, answerId: question.answer._id, feedback });
    } catch (err) {
        console.error('Answer error:', err);
        return NextResponse.json({ success: false, message: 'Failed to evaluate answer.' }, { status: 500 });
    }
}
