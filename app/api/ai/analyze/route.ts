import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BUSINESS_ANALYSIS_PROMPT } from '@/lib/ai-prompts';

export async function POST(request: NextRequest) {
    try {
        const { business_concept, api_key } = await request.json();

        if (!business_concept || business_concept.length < 100) {
            return NextResponse.json(
                { error: 'Business concept must be at least 100 characters' },
                { status: 400 }
            );
        }

        const key = api_key || process.env.GEMINI_API_KEY;
        if (!key) {
            return NextResponse.json(
                { error: 'Gemini API key is required' },
                { status: 400 }
            );
        }

        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = BUSINESS_ANALYSIS_PROMPT.replace('{BUSINESS_DESCRIPTION}', business_concept);

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Parse JSON from response (handle markdown fences)
        let jsonText = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1].trim();
        }

        const parsed = JSON.parse(jsonText);

        return NextResponse.json(parsed);
    } catch (error: unknown) {
        console.error('AI Analysis error:', error);
        const message = error instanceof Error ? error.message : 'AI analysis failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
