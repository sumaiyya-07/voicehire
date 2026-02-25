// config/fallback.js
// Built-in question bank and answer evaluator
// Used when Gemini API quota is exhausted

// ─── Question Bank by Category ───
const QUESTIONS = {
    behavioral: [
        "Tell me about yourself and what makes you a good fit for this role.",
        "Describe a time when you had to deal with a difficult coworker or team member. How did you handle it?",
        "Give me an example of a time you showed leadership, even if you weren't in a management role.",
        "Tell me about a project you're particularly proud of. What was your contribution?",
        "Describe a situation where you had to meet a tight deadline. How did you manage your time?",
        "Tell me about a time you received constructive criticism. How did you respond?",
        "Give an example of when you had to adapt to a significant change at work.",
        "Describe a time when you had to persuade someone to see things your way.",
        "Tell me about a mistake you made at work and how you handled it.",
        "How do you handle stress and pressure in the workplace?",
        "Describe a situation where you went above and beyond your job responsibilities.",
        "Tell me about a time you had to work with a team to achieve a common goal.",
        "Give an example of how you've handled a conflict at work.",
        "Describe a time when you had to make a difficult decision with limited information.",
        "Tell me about a time you failed. What did you learn from the experience?"
    ],
    technical: [
        "Explain the concept of RESTful APIs and why they are important in modern software development.",
        "What is the difference between SQL and NoSQL databases? When would you use each?",
        "Describe how you would design a scalable web application architecture.",
        "Explain the concept of Object-Oriented Programming and its main principles.",
        "What are design patterns? Can you describe a few that you've used?",
        "How would you optimize the performance of a slow database query?",
        "Explain the concept of microservices architecture and its pros and cons.",
        "What is version control and why is it important? Describe your Git workflow.",
        "How do you approach debugging a complex issue in production?",
        "Explain the difference between authentication and authorization.",
        "What is CI/CD and why is it important in software development?",
        "Describe how caching works and when you would implement it.",
        "What are the SOLID principles in software design?",
        "Explain how you would handle security vulnerabilities in a web application.",
        "What is the difference between synchronous and asynchronous programming?"
    ],
    situational: [
        "If you were assigned to a project with unclear requirements, how would you proceed?",
        "How would you handle a situation where your manager disagrees with your approach?",
        "If you discovered a critical bug right before a product launch, what would you do?",
        "How would you prioritize competing tasks when everything seems urgent?",
        "If a client requested a feature that would take significant time to build, how would you handle it?",
        "How would you onboard yourself in a new team with minimal documentation?",
        "If you noticed a colleague was struggling with their workload, what would you do?",
        "How would you handle a situation where the technology stack you're comfortable with isn't the best choice for a project?",
        "If stakeholders changed requirements mid-sprint, how would you respond?",
        "How would you approach giving negative feedback to a team member?",
        "If you were given a project with an impossible deadline, what would you do?",
        "How would you handle a situation where two team members have a conflict?",
        "If you discovered that a decision you advocated for was wrong, what would you do?",
        "How would you handle a situation where you need to learn a new technology quickly?",
        "If you were asked to cut corners on quality to meet a deadline, how would you respond?"
    ],
    mixed: [
        "Tell me about yourself and your experience in this field.",
        "What's a technical challenge you recently solved? Walk me through your approach.",
        "How do you stay current with industry trends and new technologies?",
        "Describe your ideal work environment and team culture.",
        "If you had to explain a complex technical concept to a non-technical stakeholder, how would you do it?",
        "Tell me about a time you had to balance quality with speed.",
        "What's your approach to code reviews and giving/receiving feedback?",
        "How would you handle a production outage at 2 AM?",
        "Describe a project where you had to collaborate across different teams.",
        "What do you consider your greatest professional strength and weakness?",
        "How do you approach problem-solving when you encounter something completely new?",
        "Tell me about a time you mentored someone or helped a colleague grow.",
        "What's the most impactful project you've worked on and why?",
        "How do you handle disagreements about technical decisions?",
        "Where do you see yourself professionally in the next 3-5 years?"
    ]
};

// ─── Difficulty Adjusters ───
const DIFFICULTY_PREFIX = {
    Easy: "For a junior-level candidate: ",
    Medium: "",
    Hard: "This is a senior-level question requiring depth: ",
    Expert: "This is an expert-level question demanding comprehensive insight: "
};

// ─── Generate Questions ───
function generateLocalQuestions({ jobRole, interviewType, difficulty, numQuestions, topic }) {
    const pool = QUESTIONS[interviewType] || QUESTIONS.mixed;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    let selected = shuffled.slice(0, numQuestions);

    // Add role context to first question
    if (selected.length > 0) {
        selected[0] = selected[0].replace(
            /this role|this field|your experience/gi,
            `the ${jobRole} role`
        );
    }

    return selected;
}

// ─── Evaluate Answer Locally ───
function evaluateAnswerLocally(questionText, answerText, difficulty) {
    const wordCount = answerText.trim().split(/\s+/).length;
    const sentenceCount = answerText.split(/[.!?]+/).filter(s => s.trim()).length;

    // Score based on answer quality signals
    let score = 50; // base

    // Length bonus (good answers are substantive)
    if (wordCount >= 20) score += 5;
    if (wordCount >= 50) score += 10;
    if (wordCount >= 100) score += 5;
    if (wordCount >= 150) score += 5;

    // Structure bonus (multiple sentences = structured answer)
    if (sentenceCount >= 2) score += 5;
    if (sentenceCount >= 4) score += 5;

    // Keyword detection — specific examples, metrics, frameworks
    const hasNumbers = /\d+/.test(answerText);
    const hasSpecifics = /for example|specifically|such as|instance|result|outcome|achieved|improved|increased|reduced|led to/i.test(answerText);
    const hasStructure = /first|second|additionally|moreover|however|in conclusion|finally/i.test(answerText);

    if (hasNumbers) score += 5;
    if (hasSpecifics) score += 5;
    if (hasStructure) score += 5;

    // Cap based on difficulty
    const caps = { Easy: 95, Medium: 90, Hard: 85, Expert: 80 };
    score = Math.min(score, caps[difficulty] || 90);
    score = Math.max(score, 30); // floor

    // Generate feedback
    const positiveOptions = [
        "You provided a clear and direct response to the question.",
        "Your answer shows good understanding of the topic.",
        "You communicated your thoughts effectively.",
        "Your response was well-structured and easy to follow.",
        "You demonstrated relevant knowledge in your answer."
    ];
    const improveOptions = [
        "Try adding more specific examples with measurable outcomes.",
        "Consider using the STAR method (Situation, Task, Action, Result) for behavioral answers.",
        "Adding quantifiable metrics would strengthen your response.",
        "Try to connect your answer more directly to the role requirements.",
        "Consider providing more depth with real-world examples from your experience."
    ];

    const briefOptions = [
        `${score >= 70 ? 'Good' : 'Decent'} answer. ${score >= 70 ? 'Keep this up!' : 'A bit more depth would help.'}`,
        `${score >= 70 ? 'Strong' : 'Fair'} response. ${score >= 70 ? 'Well articulated.' : 'Try to be more specific.'}`,
        `${score >= 70 ? 'Impressive' : 'Reasonable'} answer. ${score >= 70 ? 'Shows solid understanding.' : 'Could use more examples.'}`
    ];

    return {
        score,
        positive: positiveOptions[Math.floor(Math.random() * positiveOptions.length)],
        improve: improveOptions[Math.floor(Math.random() * improveOptions.length)],
        brief: briefOptions[Math.floor(Math.random() * briefOptions.length)]
    };
}

// ─── Generate Report Locally ───
function generateReportLocally(interview, qas) {
    const scores = qas.filter(qa => qa.score).map(qa => qa.score);
    const avgScore = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 60;

    const grade = avgScore >= 85 ? 'Excellent'
        : avgScore >= 70 ? 'Good'
            : avgScore >= 55 ? 'Average'
                : avgScore >= 40 ? 'Needs Improvement'
                    : 'Poor';

    // Vary sub-scores around the average
    const vary = (base, range = 10) => Math.min(100, Math.max(0, base + Math.floor(Math.random() * range * 2 - range)));

    return {
        overallScore: avgScore,
        grade,
        communication: vary(avgScore),
        relevance: vary(avgScore),
        confidence: vary(avgScore, 8),
        structure: vary(avgScore),
        depth: vary(avgScore, 12),
        strengths: [
            'You completed the interview and attempted all questions.',
            'Your responses showed clarity of thought.',
            'You demonstrated relevant domain knowledge.'
        ],
        improvements: [
            'Practice structuring answers using the STAR method.',
            'Include more specific, quantified examples from your experience.',
            `Research the ${interview.job_role} role more deeply before interviews.`
        ],
        recommendation: `Keep practicing with mock interviews regularly. Focus on building depth in your ${interview.interview_type} responses. Use structured frameworks like STAR or SOAR to organize your thoughts. With consistent practice, you can improve your score significantly.`
    };
}

module.exports = { generateLocalQuestions, evaluateAnswerLocally, generateReportLocally };
