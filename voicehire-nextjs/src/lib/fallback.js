// lib/fallback.js
// Built-in question bank and answer evaluator
// Used when Gemini API quota is exhausted
// Exact port of config/fallback.js from Express backend

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
        "Tell me about a time you failed. What did you learn from the experience?",
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
        "What is the difference between synchronous and asynchronous programming?",
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
        "If you were asked to cut corners on quality to meet a deadline, how would you respond?",
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
        "Where do you see yourself professionally in the next 3-5 years?",
    ],
};

// ─── Generate Questions ───
export function generateLocalQuestions({ jobRole, interviewType, difficulty, numQuestions, topic }) {
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
export function evaluateAnswerLocally(questionText, answerText, difficulty) {
    const wordCount = answerText.trim().split(/\s+/).length;
    const sentenceCount = answerText.split(/[.!?]+/).filter((s) => s.trim()).length;
    const answerLower = answerText.toLowerCase();
    const questionLower = questionText.toLowerCase();

    // ─── Step 1: Check RELEVANCE ───
    // Extract meaningful keywords from the question (skip stop words)
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
        'through', 'during', 'before', 'after', 'above', 'below', 'and', 'but',
        'or', 'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither',
        'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
        'such', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
        'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'this',
        'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'myself',
        'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'tell',
        'describe', 'explain', 'give', 'example', 'time', 'situation',
    ]);

    const questionWords = questionLower.match(/[a-z]{3,}/g)?.filter(w => !stopWords.has(w)) || [];
    const answerWords = new Set(answerLower.match(/[a-z]{3,}/g) || []);

    // Count how many question keywords appear in the answer
    let keywordMatches = 0;
    for (const word of questionWords) {
        // Check for exact match or partial match (stem-like)
        for (const aWord of answerWords) {
            if (aWord.includes(word.slice(0, Math.min(word.length, 4))) || word.includes(aWord.slice(0, Math.min(aWord.length, 4)))) {
                keywordMatches++;
                break;
            }
        }
    }

    const relevanceRatio = questionWords.length > 0 ? keywordMatches / questionWords.length : 0;

    // Check for topic-related keywords
    const topicKeywords = {
        technical: ['code', 'programming', 'software', 'system', 'database', 'api', 'server', 'design', 'architecture', 'algorithm', 'data', 'function', 'class', 'object', 'method', 'testing', 'debug', 'deploy', 'security', 'performance', 'query', 'framework', 'library', 'tool'],
        behavioral: ['team', 'challenge', 'situation', 'result', 'learn', 'experience', 'project', 'work', 'colleague', 'manager', 'deadline', 'goal', 'feedback', 'conflict', 'decision', 'responsibility', 'leadership', 'communication', 'collaborate', 'achieve', 'improve'],
        general: ['approach', 'strategy', 'plan', 'process', 'handle', 'manage', 'solve', 'implement', 'develop', 'create', 'build', 'analyze', 'evaluate', 'research', 'prioritize'],
    };

    let topicRelevance = false;
    for (const keywords of Object.values(topicKeywords)) {
        const matches = keywords.filter(k => answerLower.includes(k)).length;
        if (matches >= 2) { topicRelevance = true; break; }
    }

    // Detect completely off-topic / gibberish answers
    const isGibberish = wordCount < 5 || (/^(.)\1{3,}/.test(answerText.trim())) || (/(.{2,})\1{3,}/.test(answerText.trim()));
    const isIrrelevant = relevanceRatio < 0.15 && !topicRelevance;
    const isPartiallyRelevant = relevanceRatio < 0.3 && !topicRelevance;

    // ─── Step 2: Compute Score ───
    let score;

    if (isGibberish) {
        // Gibberish or nonsense
        score = 5 + Math.floor(Math.random() * 10); // 5-14
    } else if (isIrrelevant) {
        // Completely off-topic answer
        score = 10 + Math.floor(Math.random() * 10); // 10-19
    } else if (isPartiallyRelevant) {
        // Vaguely related but not addressing the question
        score = 20 + Math.floor(Math.random() * 15); // 20-34
    } else {
        // Answer is at least somewhat relevant — now evaluate quality
        score = 35; // base for relevant answers

        // Length bonus
        if (wordCount >= 20) score += 5;
        if (wordCount >= 50) score += 8;
        if (wordCount >= 100) score += 5;
        if (wordCount >= 150) score += 2;

        // Structure bonus
        if (sentenceCount >= 2) score += 3;
        if (sentenceCount >= 4) score += 4;

        // Specificity bonus
        const hasNumbers = /\d+/.test(answerText);
        const hasSpecifics = /for example|specifically|such as|instance|result|outcome|achieved|improved|increased|reduced|led to/i.test(answerText);
        const hasStructure = /first|second|additionally|moreover|however|in conclusion|finally/i.test(answerText);

        if (hasNumbers) score += 4;
        if (hasSpecifics) score += 5;
        if (hasStructure) score += 4;

        // Relevance bonus for highly relevant answers
        if (relevanceRatio >= 0.5) score += 5;
        if (relevanceRatio >= 0.7) score += 5;

        // Cap based on difficulty
        const caps = { Easy: 92, Medium: 88, Hard: 82, Expert: 78 };
        score = Math.min(score, caps[difficulty] || 88);
    }

    score = Math.max(score, 5);
    score = Math.min(score, 100);

    // ─── Step 3: Generate feedback based on score ───
    let positive, improve, brief;

    if (score < 20) {
        positive = 'Your answer did not address the question asked. Make sure to listen carefully and respond to what is being asked.';
        improve = 'Please re-read the question and provide an answer that directly addresses it with relevant details.';
        brief = 'Your answer was not relevant to the question. Please try to address the actual topic.';
    } else if (score < 35) {
        positive = 'Your answer touched on some general concepts but did not directly address the question.';
        improve = 'Focus on answering the specific question asked. Use the STAR method to structure your response around the topic.';
        brief = 'Your answer was only partially related to the question. Try to be more specific and on-topic.';
    } else if (score < 55) {
        const options = [
            'You addressed the question but could provide more depth and specific examples.',
            'Your answer shows basic understanding of the topic.',
        ];
        positive = options[Math.floor(Math.random() * options.length)];
        improve = 'Add specific examples with measurable outcomes to strengthen your response.';
        brief = 'Decent attempt. Try to be more detailed with real-world examples.';
    } else if (score < 70) {
        positive = 'You provided a relevant answer with good structure.';
        improve = 'Consider adding more quantifiable metrics and specific examples from your experience.';
        brief = 'Good answer. A bit more depth and examples would make it stronger.';
    } else {
        const options = [
            'Strong answer with relevant details and good structure.',
            'You demonstrated clear understanding and provided specifics.',
        ];
        positive = options[Math.floor(Math.random() * options.length)];
        improve = 'Keep polishing — consider connecting your answer to the company or role requirements.';
        brief = score >= 80 ? 'Impressive answer! Well articulated and detailed.' : 'Strong response. Keep this up!';
    }

    return { score, positive, improve, brief };
}

// ─── Generate Report Locally ───
export function generateReportLocally(interview, qas) {
    const scores = qas.filter((qa) => qa.score).map((qa) => qa.score);
    const avgScore = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 60;

    const grade =
        avgScore >= 85
            ? 'Excellent'
            : avgScore >= 70
                ? 'Good'
                : avgScore >= 55
                    ? 'Average'
                    : avgScore >= 40
                        ? 'Needs Improvement'
                        : 'Poor';

    // Vary sub-scores around the average
    const vary = (base, range = 10) =>
        Math.min(100, Math.max(0, base + Math.floor(Math.random() * range * 2 - range)));

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
            'You demonstrated relevant domain knowledge.',
        ],
        improvements: [
            'Practice structuring answers using the STAR method.',
            'Include more specific, quantified examples from your experience.',
            `Research the ${interview.job_role} role more deeply before interviews.`,
        ],
        recommendation: `Keep practicing with mock interviews regularly. Focus on building depth in your ${interview.interview_type} responses. Use structured frameworks like STAR or SOAR to organize your thoughts. With consistent practice, you can improve your score significantly.`,
    };
}
