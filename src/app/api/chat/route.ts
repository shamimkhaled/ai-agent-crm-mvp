import { NextResponse } from 'next/server';
import { generateGeminiResponse } from '@/services/gemini';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages array' }, { status: 400 });
    }

    const { crmContext } = body as { crmContext?: string };

    const systemPrompt = `You are a helpful AI CRM assistant for a business in Bangladesh (e.g. Garments, ISP, Distributor).
Respond intelligently, concisely, and professionally. Mix Bangla and English as appropriate.
You can understand order queries, product tracking, and dealer issues.
Use mock data dynamically in your head if asked about a specific dealer code like '1212' or '3340'.
${crmContext ? `\n\n--- Live CRM / product context (JSON or text from your API) ---\n${crmContext}` : ""}`;

    const { text: aiMessage, error: geminiError } = await generateGeminiResponse(messages, systemPrompt);

    // --- SUPABASE REALTIME SYNC (MVP ARCHITECTURE DEMONSTRATION) ---
    // If you have configured the schema correctly, this command pushes the aiMessage
    // down to Supabase, triggering the frontend `useSupabaseRealtime` webhook automatically.
    /*
    const supabase = createClient();
    await supabase.from('conversations').insert([{ 
       last_message: aiMessage, 
       status: 'active' 
    }]);
    */

    return NextResponse.json({ result: aiMessage, geminiError: geminiError ?? null });
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
