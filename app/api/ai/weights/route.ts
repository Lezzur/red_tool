import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { WEIGHT_ASSIGNMENT_PROMPT } from '@/lib/ai-prompts';

export async function POST(request: NextRequest) {
    try {
        const { responsibilities, business_type, stage, api_key } = await request.json();

        const key = api_key || process.env.GEMINI_API_KEY;
        if (!key) {
            return NextResponse.json({ error: 'Gemini API key is required' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const respList = responsibilities.map((r: { id: string; title: string; description: string; criticality: string; typical_time_commitment: string }) =>
            `- ${r.id}: ${r.title} (${r.criticality}) - ${r.description} | Time: ${r.typical_time_commitment}`
        ).join('\n');

        const prompt = WEIGHT_ASSIGNMENT_PROMPT
            .replace('{BUSINESS_TYPE}', business_type)
            .replace('{STAGE}', stage)
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
        console.error('Weight assignment error:', error);
        const message = error instanceof Error ? error.message : 'Weight assignment failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
