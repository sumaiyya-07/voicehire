// app/api/report/generate/[interviewId]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';
import { callGroq, parseGroqJSON } from '@/lib/groq';
import { generateReportLocally } from '@/lib/fallback';

export async function POST(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    const { interviewId } = await params;
    try {
        const interview = await Interview.findOne({ _id: interviewId, user: auth.user.id });
        if (!interview) return NextResponse.json({ success: false, message: 'Interview not found.' }, { status: 404 });
        const answeredQAs = interview.questions.filter((q) => q.answer?.answerText).map((q) => ({ question_text: q.questionText, answer_text: q.answer.answerText, score: q.answer.score }));
        if (answeredQAs.length === 0) return NextResponse.json({ success: false, message: 'No answers found for this interview.' }, { status: 400 });
        const qaText = answeredQAs.map((qa, i) => `Q${i + 1}: ${qa.question_text}\nAnswer: ${qa.answer_text}`).join('\n\n');
        const prompt = `You are a professional interview coach evaluating a complete ${interview.difficulty} ${interview.interviewType} interview for a ${interview.jobRole} candidate.\n\nHere are all the questions and candidate answers:\n\n${qaText}\n\nAnalyze the entire interview holistically and return ONLY a valid JSON object. No markdown, no explanation:\n{\n  "overallScore": <integer 0-100>,\n  "grade": "<Excellent|Good|Average|Needs Improvement|Poor>",\n  "communication": <integer 0-100>,\n  "relevance": <integer 0-100>,\n  "confidence": <integer 0-100>,\n  "structure": <integer 0-100>,\n  "depth": <integer 0-100>,\n  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],\n  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>", "<actionable improvement 3>"],\n  "recommendation": "<2-3 sentence strategic recommendation for this candidate>"\n}`;
        let analysis;
        try {
            const raw = await callGroq(prompt, 0.4);
            analysis = parseGroqJSON(raw);
        } catch (e) {
            analysis = generateReportLocally({ job_role: interview.jobRole, interview_type: interview.interviewType, difficulty: interview.difficulty }, answeredQAs);
        }
        interview.report = { overallScore: analysis.overallScore, grade: analysis.grade, communication: analysis.communication, relevance: analysis.relevance, confidence: analysis.confidence, structure: analysis.structure, depth: analysis.depth, strengths: analysis.strengths, improvements: analysis.improvements, recommendation: analysis.recommendation };
        interview.overallScore = analysis.overallScore;
        interview.grade = analysis.grade;
        interview.status = 'completed';
        if (!interview.completedAt) interview.completedAt = new Date();
        await interview.save();
        const qaBreakdown = interview.questions.map((q) => ({ question_text: q.questionText, answer_text: q.answer?.answerText || null, score: q.answer?.score ?? null, positive: q.answer?.positive || null, improve: q.answer?.improve || null, brief: q.answer?.brief || null }));
        return NextResponse.json({ success: true, reportId: interview._id, report: { ...analysis, generatedAt: new Date().toISOString() }, interview: { id: interview._id, jobRole: interview.jobRole, experience: interview.experience, interviewType: interview.interviewType, difficulty: interview.difficulty, topic: interview.topic, startedAt: interview.createdAt }, qaBreakdown });
    } catch (err) {
        console.error('Report error:', err);
        return NextResponse.json({ success: false, message: 'Failed to generate report: ' + err.message }, { status: 500 });
    }
}
