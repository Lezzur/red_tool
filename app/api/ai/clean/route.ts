import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CLEANING_PROMPT } from '@/lib/ai-prompts';

export async function POST(request: NextRequest) {
    try {
        const { responsibilities, business_profile, api_key } = await request.json();

        const key = api_key || process.env.GEMINI_API_KEY;
        if (!key) {
            return NextResponse.json({ error: 'Gemini API key is required' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const respList = responsibilities.map((r: { id: string; category: string; title: string; description: string; nominated_by: string[] }) =>
            `[${r.id}] Category: ${r.category} | Title: ${r.title} | Description: ${r.description} | Nominated by: ${r.nominated_by.join(', ')}`
        ).join('\n');

        const prompt = CLEANING_PROMPT
            .replace('{BUSINESS_PROFILE}', JSON.stringify(business_profile))
            .replace('{RESPONSIBILITIES}', respList);

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        let jsonText = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1].trim();
        }

        const parsed = JSON.parse(jsonText);
        return NextResponse.json(parsed);
    } catch (error: unknown) {
        console.error('AI Cleaning error:', error);
        const message = error instanceof Error ? error.message : 'AI cleaning failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
