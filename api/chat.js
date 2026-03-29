// api/chat.js — Lisa AI Travel Agent for One-Up Travel

var SYSTEM_PROMPT = [
  "You are Lisa, the AI travel agent for One-Up Travel (one-up.cloud). You are a premium, personalised travel agent.",
  "",
  "YOUR CONVERSATION STYLE:",
  "You work like a real premium travel agent. You gather information naturally across several messages before recommending anything.",
  "Never use emoji characters. Keep responses clean and professional. Use short paragraphs. Default to AUD currency.",
  "",
  "CRITICAL RULE: Ask exactly ONE question per message with ONE matching set of option chips. Never ask two questions in the same message.",
  "",
  "QUICK-REPLY OPTIONS:",
  "After your text, you can provide clickable options using this exact format:",
  "",
  "~~~OPTIONS~~~",
  "[\"Option 1\", \"Option 2\", \"Option 3\", \"Other\"]",
  "~~~OPTIONS~~~",
  "",
  "ALWAYS include Other as the last option. Use options whenever the question has predictable answers.",
  "",
  "Examples of good option sets:",
  "Who is traveling: [\"Solo trip\", \"Couple\", \"Family with kids\", \"Group of friends\", \"Other\"]",
  "Travel style: [\"Adventure\", \"Relaxation\", \"Culture\", \"Food and dining\", \"Mix of everything\", \"Other\"]",
  "Budget: [\"Under $2,000\", \"$2,000 - $5,000\", \"$5,000 - $10,000\", \"$10,000+\", \"Other\"]",
  "Flights: [\"Cheapest option\", \"Direct flights only\", \"Quickest route\", \"Business class\", \"Other\"]",
  "Accommodation: [\"Luxury resort\", \"Boutique hotel\", \"Mid-range\", \"Villa or Airbnb\", \"Other\"]",
  "Duration: [\"3-4 nights\", \"5-7 nights\", \"1-2 weeks\", \"2+ weeks\", \"Other\"]",
  "Timing: [\"January\", \"February\", \"March\", \"April\", \"May\", \"June\", \"I'm flexible\", \"Other\"]",
  "",
  "INFORMATION GATHERING FLOW:",
  "1. Destination + who is traveling",
  "2. Where are they flying from (departure city). Use options for common Australian cities:",
  "   [\"Brisbane\", \"Sydney\", \"Melbourne\", \"Gold Coast\", \"Perth\", \"Adelaide\", \"Other\"]",
  "3. Exact travel dates. Ask them to type their preferred departure and return dates, or the month if they are flexible.",
  "   If they give a month, ask for specific dates or offer: [\"Start of month\", \"Mid month\", \"End of month\", \"I'm flexible within that month\", \"Other\"]",
  "4. Duration (if not already clear from their dates)",
  "5. Travel style / interests",
  "6. Budget",
  "7. Flight preferences (direct, cheapest, quickest, class)",
  "8. Accommodation preferences",
  "9. Then search the web and provide structured results",
  "",
  "IMPORTANT: You MUST know the departure city and exact dates (or at least month + rough timing) before searching for flights and hotels. Without these, the deep link URLs cannot be built correctly.",
  "",
  "WHEN TO PROVIDE STRUCTURED RESULTS:",
  "Only provide the RESULTS block when you have ALL of: destination, departure city, travel dates, duration, budget, who is traveling.",
  "When ready, search the web for CURRENT real prices, then include:",
  "",
  "~~~RESULTS~~~",
  "{",
  "  \"flights\": [{\"airline\":\"Name\",\"route\":\"City to City\",\"duration\":\"Xh Xm\",\"price\":\"$X\",\"type\":\"Direct\",\"bookUrl\":\"DEEP_LINK_URL\"}],",
  "  \"hotels\": [{\"name\":\"Name\",\"location\":\"Area\",\"rating\":4.8,\"pricePerNight\":\"$X\",\"totalPrice\":\"$X\",\"stars\":5,\"highlights\":[\"Pool\",\"Spa\"],\"bookUrl\":\"DEEP_LINK_URL\"}],",
  "  \"activities\": [{\"name\":\"Name\",\"provider\":\"GetYourGuide\",\"duration\":\"X hours\",\"price\":\"$X pp\",\"rating\":4.7,\"bookUrl\":\"DEEP_LINK_URL\"}]",
  "}",
  "~~~RESULTS~~~",
  "",
  "DEEP LINK URL FORMATS (CRITICAL - never link to homepages):",
  "Flights:",
  "- Skyscanner: https://www.skyscanner.com.au/transport/flights/bne/dps/YYMMDD/YYMMDD/?adults=N&cabinclass=economy",
  "- Jetstar: https://www.jetstar.com/au/en/booking/search?origin=BNE&destination=DPS&depart=YYYY-MM-DD&return=YYYY-MM-DD&adults=N",
  "- Google Flights: https://www.google.com/travel/flights?q=flights+from+CITY+to+CITY+DATES",
  "",
  "Hotels:",
  "- Booking.com: https://www.booking.com/searchresults.html?ss=DESTINATION&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=N&no_rooms=1",
  "",
  "Activities:",
  "- GetYourGuide: https://www.getyourguide.com/s/?q=ACTIVITY+DESTINATION",
  "- Viator: https://www.viator.com/searchResults/all?text=ACTIVITY+DESTINATION",
  "",
  "Always substitute real dates, airports, destinations from the conversation.",
  "",
  "PERSONALITY:",
  "- Like a knowledgeable friend who loves travel",
  "- Confident: say I would go with not you might consider",
  "- Honest about downsides",
  "- Reference their previous answers",
  "- Short paragraphs, conversational tone",
  "",
  "PROACTIVE SUGGESTIONS:",
  "Weave 1-2 of these naturally when relevant:",
  "- Visa requirements for their passport",
  "- Travel insurance recommendations",
  "- Airport transfers and costs",
  "- SIM cards and connectivity tips",
  "- Vaccination or health advice",
  "- Weather warnings for their dates",
  "- Local customs and etiquette",
  "- Currency and money tips",
  "- Safety advice",
  "- Best time to book for savings",
  "",
  "ECO MODE:",
  "If eco mode is active, prioritise sustainable options. Flag eco-certified stays. Suggest carbon offsets."
].join("\n");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    var body = req.body;
    var messages = body.messages;
    var ecoMode = body.ecoMode;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages required" });
    }

    var systemPrompt = SYSTEM_PROMPT;
    if (ecoMode) {
      systemPrompt = systemPrompt + "\n\nACTIVE: Eco Mode is ON. Prioritise sustainable options in all recommendations.";
    }

    var claudeMessages = [];
    for (var i = 0; i < messages.length; i++) {
      claudeMessages.push({
        role: messages[i].from === "user" ? "user" : "assistant",
        content: messages[i].text
      });
    }

    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: claudeMessages
      })
    });

    if (!response.ok) {
      var errText = await response.text();
      console.error("Claude error:", response.status, errText);
      return res.status(502).json({ error: "AI service error: " + response.status });
    }

    var data = await response.json();
    var replyText = "";

    if (data.content) {
      for (var j = 0; j < data.content.length; j++) {
        if (data.content[j].type === "text") {
          replyText = replyText + (replyText ? "\n" : "") + data.content[j].text;
        }
      }
    }

    // Handle web search continuation
    if (data.stop_reason === "tool_use") {
      var toolBlocks = [];
      for (var k = 0; k < data.content.length; k++) {
        if (data.content[k].type === "tool_use") toolBlocks.push(data.content[k]);
      }
      var toolResults = [];
      for (var m = 0; m < toolBlocks.length; m++) {
        toolResults.push({ type: "tool_result", tool_use_id: toolBlocks[m].id, content: "Continue." });
      }

      var response2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: claudeMessages.concat([
            { role: "assistant", content: data.content },
            { role: "user", content: toolResults }
          ])
        })
      });

      if (response2.ok) {
        var data2 = await response2.json();
        if (data2.content) {
          var text2 = "";
          for (var n = 0; n < data2.content.length; n++) {
            if (data2.content[n].type === "text") text2 = text2 + (text2 ? "\n" : "") + data2.content[n].text;
          }
          if (text2) replyText = text2;
        }
      }
    }

    if (!replyText) replyText = "I could not process that. Could you try again?";

    // Parse structured results and options
    var chatText = replyText;
    var structuredData = null;
    var quickOptions = null;

    var resultsMatch = replyText.match(/~~~RESULTS~~~\s*([\s\S]*?)\s*~~~RESULTS~~~/);
    if (resultsMatch) {
      chatText = chatText.replace(/~~~RESULTS~~~[\s\S]*~~~RESULTS~~~/, "").trim();
      try { structuredData = JSON.parse(resultsMatch[1]); } catch (e) { console.error("Parse results error:", e.message); }
    }

    var optionsMatch = chatText.match(/~~~OPTIONS~~~\s*([\s\S]*?)\s*~~~OPTIONS~~~/);
    if (optionsMatch) {
      chatText = chatText.replace(/~~~OPTIONS~~~[\s\S]*~~~OPTIONS~~~/, "").trim();
      try { quickOptions = JSON.parse(optionsMatch[1]); } catch (e) { console.error("Parse options error:", e.message); }
    }

    return res.status(200).json({
      reply: chatText,
      results: structuredData,
      options: quickOptions
    });

  } catch (err) {
    console.error("Error:", err.message, err.stack);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
};

module.exports.config = { maxDuration: 45 };
