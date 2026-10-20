import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const geminiKey = request.headers.get('X-Gemini-Key') || '';
    const aiMode = request.headers.get('X-AI-Mode') || 'local_rules';
    const localAiUrl = request.headers.get('X-Local-AI-Url') || '';
    const localAiModel = request.headers.get('X-Local-AI-Model') || '';
    
    const response = await fetch('http://localhost:8001/api/generate-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gemini-Key': geminiKey,
        'X-AI-Mode': aiMode,
        'X-Local-AI-Url': localAiUrl,
        'X-Local-AI-Model': localAiModel
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
