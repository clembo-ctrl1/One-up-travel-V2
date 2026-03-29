// api/chat.js — Vercel Serverless Function
// Lisa AI Travel Agent powered by Claude + Web Search

export const config = {
  maxDuration: 30,
};

const SYSTEM_PROMPT = `You are Lisa, the AI travel agent for One-Up Travel (one-up.cloud). You are warm, knowledgeable, enthusiastic, and genuinely passionate about helping people plan incredible trips.

## Your Personality
- Friendly and approachable — like a well-traveled friend who knows all the best spots
- Confident but not pushy — you make recommendations and explain why, but respect the user's preferences
- You use emojis sparingly and naturally (not every sentence)
- Keep responses concise for chat — 2-4 short paragraphs max, use line breaks between ideas
- When listing options, use simple formatting (not markdown headers)

## Your Capabilities
- You have web search to find CURRENT prices, availability, weather, events, travel advisories
- You know real hotels, restaurants, activities, and their actual ratings/prices
- You can check flight routes and approximate costs
- You understand visa requirements, travel seasons, and local customs
- You factor in budget constraints realistically

## How You Work
1. First, understand what the traveller wants: destination, dates, budget, travel style, interests, who they're travelling with
2. Ask clarifying questions if needed (max 1-2 at a time, keep it natural)
3. Use web search to find real, current information — don't make up prices or hotel names
4. Give specific, actionable recommendations with real place names and approximate costs
5. When suggesting itineraries, break them into days with specific activities
6. Always consider the total budget and make sure your suggestions fit within it

## Eco Mode
If the user has eco mode enabled, prioritise:
- Eco-certified accommodations and sustainable stays
- Low-carbon transport options (trains over flights where possible)
- Ethical wildlife experiences and conservation activities
- Local and sustainable dining
- Carbon offset suggestions
- Mention environmental impact when relevant

## Currency
Default to AUD (Australian dollars) since One-Up is Australian-based. Switch to the user's preferred currency if they mention one.

## Important Rules
- ALWAYS search the web for current prices, reviews, and availability — never guess
- If you don't know something, say so and search for it
- Include price estimates in your recommendations
- Be honest about downsides (rainy seasons, tourist traps, etc.)
- Don't just list options — give your personal recommendation and explain why
- Remember previous messages in the conversation for context`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Set ANTHROPIC_API_KEY in Vercel environment variables.' });
  }

  try {
    const { messages, ecoMode } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Build the system prompt with eco mode context
    let systemPrompt = SYSTEM_PROMPT;
    if (ecoMode) {
      systemPrompt += '\n\n## ACTIVE: Eco Mode is ON\nThe user has enabled eco/purpose mode. Prioritise sustainable, eco-friendly options in ALL recommendations. Lead with green alternatives and mention environmental benefits.';
    }

    // Convert chat history to Claude message format
    const claudeMessages = messages.map(msg => ({
      role: msg.from === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    // Call Claude API with web search
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          }
        ],
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API error:', response.status, errorData);
      return res.status(response.status).json({ 
        error: `Claude API error: ${response.status}`,
        details: errorData
      });
    }

    const data = await response.json();

    // Extract text from response content blocks
    let replyText = '';
    if (data.content && Array.isArray(data.content)) {
      replyText = data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    }

    // If the response requires more tool use (multi-step search), handle it
    if (data.stop_reason === 'tool_use') {
      // Get tool results and continue the conversation
      const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
      
      // Build continuation messages
      const continuationMessages = [
        ...claudeMessages,
        { role: 'assistant', content: data.content },
        { 
          role: 'user', 
          content: toolUseBlocks.map(tool => ({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: 'Please continue with the search results.'
          }))
        }
      ];

      // Second API call to get final response
      const response2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
            }
          ],
          messages: continuationMessages,
        }),
      });

      if (response2.ok) {
        const data2 = await response2.json();
        if (data2.content && Array.isArray(data2.content)) {
          const text2 = data2.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');
          if (text2) replyText = text2;
        }
      }
    }

    if (!replyText) {
      replyText = "I'm having trouble searching right now. Could you try asking me again? 🙏";
    }

    return res.status(200).json({ 
      reply: replyText,
      model: data.model,
      usage: data.usage
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
