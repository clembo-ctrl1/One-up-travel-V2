// api/chat.js — Vercel Serverless Function
// Lisa AI Travel Agent powered by Claude + Web Search

const SYSTEM_PROMPT = `You are Lisa, the AI travel agent for One-Up Travel (one-up.cloud). You are warm, knowledgeable, enthusiastic, and genuinely passionate about helping people plan incredible trips.

## Your Personality
- Friendly and approachable — like a well-traveled friend who knows all the best spots
- Confident but not pushy — you make recommendations and explain why
- Keep responses concise for chat — 2-4 short paragraphs max
- Never use emoji characters in your responses — keep it clean and professional

## Your Capabilities
- You have web search to find CURRENT prices, availability, weather, events, travel advisories
- You know real hotels, restaurants, activities, and their actual ratings/prices
- You can check flight routes and approximate costs
- You understand visa requirements, travel seasons, and local customs
- You factor in budget constraints realistically

## How You Work
1. Understand what the traveller wants: destination, dates, budget, travel style, interests, who they're with
2. Ask clarifying questions if needed (max 1-2 at a time)
3. Use web search to find real, current information — never make up prices or hotel names
4. Give specific, actionable recommendations with real place names and approximate costs in AUD
5. When suggesting itineraries, break them into days with specific activities
6. Always consider the total budget

## Eco Mode
If the user has eco mode enabled, prioritise:
- Eco-certified accommodations and sustainable stays
- Low-carbon transport options
- Ethical wildlife experiences
- Local and sustainable dining
- Carbon offset suggestions

## Important Rules
- ALWAYS search the web for current prices and reviews — never guess
- If you don't know something, say so and search for it
- Be honest about downsides (rainy seasons, tourist traps, etc.)
- Default to AUD currency
- Never use emoji characters — keep responses professional and clean
- Give your personal recommendation and explain why`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not found');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    var body = req.body;
    var messages = body.messages;
    var ecoMode = body.ecoMode;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages required' });
    }

    var systemPrompt = SYSTEM_PROMPT;
    if (ecoMode) {
      systemPrompt += '\n\n## ACTIVE: Eco Mode is ON\nPrioritise sustainable, eco-friendly options in ALL recommendations.';
    }

    var claudeMessages = [];
    for (var i = 0; i < messages.length; i++) {
      claudeMessages.push({
        role: messages[i].from === 'user' ? 'user' : 'assistant',
        content: messages[i].text
      });
    }

    var response = await fetch('https://api.anthropic.com/v1/messages', {
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
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      var errText = await response.text();
      console.error('Claude error:', response.status, errText);
      return res.status(502).json({ error: 'AI service error: ' + response.status });
    }

    var data = await response.json();
    var replyText = '';

    if (data.content) {
      for (var j = 0; j < data.content.length; j++) {
        if (data.content[j].type === 'text') {
          replyText += (replyText ? '\n' : '') + data.content[j].text;
        }
      }
    }

    if (data.stop_reason === 'tool_use') {
      var toolBlocks = [];
      for (var k = 0; k < data.content.length; k++) {
        if (data.content[k].type === 'tool_use') toolBlocks.push(data.content[k]);
      }

      var toolResults = [];
      for (var m = 0; m < toolBlocks.length; m++) {
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlocks[m].id, content: 'Continue.' });
      }

      var response2 = await fetch('https://api.anthropic.com/v1/messages', {
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
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: claudeMessages.concat([
            { role: 'assistant', content: data.content },
            { role: 'user', content: toolResults }
          ]),
        }),
      });

      if (response2.ok) {
        var data2 = await response2.json();
        if (data2.content) {
          var text2 = '';
          for (var n = 0; n < data2.content.length; n++) {
            if (data2.content[n].type === 'text') text2 += (text2 ? '\n' : '') + data2.content[n].text;
          }
          if (text2) replyText = text2;
        }
      }
    }

    if (!replyText) replyText = "I couldn't process that. Could you try again?";

    return res.status(200).json({ reply: replyText });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

module.exports.config = { maxDuration: 30 };
