// app/api/report/generate/[interviewId]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import Question from '@/models/Question';
import Answer from '@/models/Answer';
import Report from '@/models/Report';
import { verifyAuth } from '@/lib/auth';
import { callGemini, parseGeminiJSON } from '@/lib/gemini';
import { generateReportLocally } from '@/lib/fallback';

export async function POST(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    await connectDB();

    const { interviewId } = await params;

    // 1. Verify interview belongs to this user
    const interview = await Interview.findOne({ _id: interviewId, user_id: auth.user.id }).lean();
    if (!interview) {
        return NextResponse.json(
            { success: false, message: 'Interview not found.' },
            { status: 404 }
        );
    }

    // 2. Get all questions + answers
    const questions = await Question.find({ interview_id: interviewId }).sort({ question_index: 1 }).lean();
    const qas = await Promise.all(
        questions.map(async (q) => {
            const answer = await Answer.findOne({ question_id: q._id, interview_id: interviewId }).lean();
            return {
                question_text: q.question_text,
                answer_text: answer?.answer_text || null,
                score: answer?.score || null,
                positive: answer?.positive || null,
                improve: answer?.improve || null,
                brief: answer?.brief || null,
            };
        })
    );

    const answeredQAs = qas.filter((qa) => qa.answer_text);

    if (answeredQAs.length === 0) {
        return NextResponse.json(
            { success: false, message: 'No answers found for this interview.' },
            { status: 400 }
        );
    }

    // 3. Build Gemini prompt
    const qaText = answeredQAs
        .map((qa, i) => `Q${i + 1}: ${qa.question_text}\nAnswer: ${qa.answer_text}`)
        .join('\n\n');

    const prompt = `You are a professional interview coach evaluating a complete ${interview.difficulty} ${interview.interview_type} interview for a ${interview.job_role} candidate.

Here are all the questions and candidate answers:

${qaText}

Analyze the entire interview holistically and return ONLY a valid JSON object. No markdown, no explanation:
{
  "overallScore": <integer 0-100>,
  "grade": "<Excellent|Good|Average|Needs Improvement|Poor>",
  "communication": <integer 0-100>,
  "relevance": <integer 0-100>,
  "confidence": <integer 0-100>,
  "structure": <integer 0-100>,
  "depth": <integer 0-100>,
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>", "<actionable improvement 3>"],
  "recommendation": "<2-3 sentence strategic recommendation for this candidate's career development>"
}`;

    try {
        let analysis;

        try {
            const raw = await callGemini(prompt, 0.4);
            analysis = parseGeminiJSON(raw);
            console.log('✅ Report generated via Gemini AI');
        } catch (e) {
            console.log('⚠️ Gemini unavailable, using local report generator');
            analysis = generateReportLocally(interview, answeredQAs);
        }

        // 4. Delete old report if exists (regeneration)
        await Report.deleteMany({ interview_id: interviewId });

        // 5. Save report to database
        const report = await Report.create({
            interview_id: interviewId,
            overall_score: analysis.overallScore,
            grade: analysis.grade,
            communication: analysis.communication,
            relevance: analysis.relevance,
            confidence: analysis.confidence,
            structure: analysis.structure,
            depth: analysis.depth,
            strengths: analysis.strengths,
            improvements: analysis.improvements,
            recommendation: analysis.recommendation,
        });

        // 6. Update interview overall score
        await Interview.findByIdAndUpdate(interviewId, {
            overall_score: analysis.overallScore,
            grade: analysis.grade,
            status: 'completed',
            completed_at: interview.completed_at || new Date(),
        });

        // 7. Return full report + Q&A breakdown
        return NextResponse.json({
            success: true,
            reportId: report._id,
            report: {
                ...analysis,
                strengths: analysis.strengths,
                improvements: analysis.improvements,
                generatedAt: new Date().toISOString(),
            },
            interview: {
                id: interview._id,
                jobRole: interview.job_role,
                experience: interview.experience,
                interviewType: interview.interview_type,
                difficulty: interview.difficulty,
                topic: interview.topic,
                startedAt: interview.started_at,
            },
            qaBreakdown: qas,
        });
    } catch (err) {
        console.error('Report generation error:', err);
        return NextResponse.json(
            { success: false, message: 'Failed to generate report: ' + err.message },
            { status: 500 }
        );
    }
}
