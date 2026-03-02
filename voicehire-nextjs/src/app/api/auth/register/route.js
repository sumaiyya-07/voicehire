// app/api/auth/register/route.js
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

function generateToken(user) {
    return jwt.sign(
        { id: user._id.toString(), email: user.email, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

export async function POST(request) {
    await connectDB();

    try {
        const { name, email, password, photo } = await request.json();

        // Validation
        if (!name || name.trim().length < 2) {
            return NextResponse.json(
                { success: false, errors: [{ msg: 'Name must be at least 2 characters' }] },
                { status: 400 }
            );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return NextResponse.json(
                { success: false, errors: [{ msg: 'Enter a valid email' }] },
                { status: 400 }
            );
        }

        if (!password || password.length < 6) {
            return NextResponse.json(
                { success: false, errors: [{ msg: 'Password must be at least 6 characters' }] },
                { status: 400 }
            );
        }

        // Check if email already exists
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return NextResponse.json(
                { success: false, message: 'An account with this email already exists.' },
                { status: 409 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Insert user
        const newUser = await User.create({
            name: name.trim(),
            email: email.toLowerCase(),
            password: hashedPassword,
            photo: photo || null,
        });

        const token = generateToken(newUser);

        return NextResponse.json(
            {
                success: true,
                message: 'Account created successfully!',
                token,
                user: {
                    id: newUser._id,
                    name: newUser.name,
                    email: newUser.email,
                    photo: newUser.photo,
                    created_at: newUser.created_at,
                },
            },
            { status: 201 }
        );
    } catch (err) {
        console.error('Register error:', err);
        return NextResponse.json(
            { success: false, message: 'Server error during registration.' },
            { status: 500 }
        );
    }
}
