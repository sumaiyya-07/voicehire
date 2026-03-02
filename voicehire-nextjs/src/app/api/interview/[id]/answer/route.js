// app/api/interview/[id]/answer/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import Question from '@/models/Question';
import Answer from '@/models/Answer';
import { verifyAuth } from '@/lib/auth';
import { callGemini, parseGeminiJSON } from '@/lib/gemini';
import { evaluateAnswerLocally } from '@/lib/fallback';

export async function POST(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    await connectDB();

    const { id: interviewId } = await params;
    const { questionId, answerText } = await request.json();

    if (!questionId || !answerText || answerText.trim().length < 5) {
        return NextResponse.json(
            { success: false, message: 'questionId and answerText (min 5 chars) are required.' },
            { status: 400 }
        );
    }

    // Verify interview belongs to this user
    const interview = await Interview.findOne({ _id: interviewId, user_id: auth.user.id });
    if (!interview) {
        return NextResponse.json(
            { success: false, message: 'Interview not found.' },
            { status: 404 }
        );
    }

    // Get the question
    const question = await Question.findOne({ _id: questionId, interview_id: interviewId });
    if (!question) {
        return NextResponse.json(
            { success: false, message: 'Question not found.' },
            { status: 404 }
        );
    }

    try {
        // Evaluate answer with Gemini
        const prompt = `You are a STRICT interview evaluator for a ${interview.difficulty} ${interview.interview_type} interview for a ${interview.job_role} role.

CRITICAL SCORING RULES:
- If the answer is COMPLETELY IRRELEVANT, off-topic, gibberish, or does not address the question at all, give a score of 0-15.
- If the answer is only PARTIALLY relevant or vaguely related with no substance, give a score of 15-35.
- If the answer addresses the question but lacks depth or examples, give 35-60.
- If the answer is good with some relevant details, give 60-80.
- Only give 80+ for excellent, detailed, relevant answers with specific examples.

Question: "${question.question_text}"
Candidate's answer: "${answerText}"

First check: Does the answer actually address the question asked? If NOT, the score MUST be below 20.

Return ONLY a valid JSON object. No markdown. No explanation:
{
  "score": <integer 0 to 100>,
  "positive": "<one specific strength of this answer in 1-2 sentences, or state what was lacking if score is low>",
  "improve": "<one specific actionable improvement in 1-2 sentences>",
  "brief": "<one sentence overall verdict, spoken aloud to the candidate>"
}`;

        let feedback;
        try {
            const raw = await callGemini(prompt, 0.5);
            feedback = parseGeminiJSON(raw);
            console.log('✅ Answer evaluated via Gemini AI');
        } catch (e) {
            console.log('⚠️ Gemini unavailable, using local evaluator');
            feedback = evaluateAnswerLocally(question.question_text, answerText, interview.difficulty);
        }

        // Save answer to database
        const answer = await Answer.create({
            interview_id: interviewId,
            question_id: questionId,
            answer_text: answerText,
            score: feedback.score,
            positive: feedback.positive,
            improve: feedback.improve,
            brief: feedback.brief,
        });

        return NextResponse.json({
            success: true,
            answerId: answer._id,
            feedback,
        });
    } catch (err) {
        console.error('Answer submission error:', err);
        return NextResponse.json(
            { success: false, message: 'Failed to evaluate answer.' },
            { status: 500 }
        );
    }
}
