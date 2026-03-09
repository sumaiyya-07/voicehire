// lib/auth.js
// JWT verification helper for Next.js API routes

import jwt from 'jsonwebtoken';

export function verifyAuth(request) {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            error: true,
            status: 401,
            body: {
                success: false,
                message: 'No token provided. Please login first.',
            },
        };
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return { error: false, user: decoded }; // { id, email, name }
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return {
                error: true,
                status: 401,
                body: {
                    success: false,
                    message: 'Session expired. Please login again.',
                },
            };
        }
        return {
            error: true,
            status: 401,
            body: {
                success: false,
                message: 'Invalid token. Please login again.',
            },
        };
    }
}
