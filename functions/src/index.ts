import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import OpenAI from "openai";

admin.initializeApp();

// CORS configuration for callable functions
const corsOptions = {
  origin: true, // Allow all origins (Firebase handles auth separately)
};

// System prompt for monster extraction
const SYSTEM_PROMPT = `You are a D&D monster stat block parser. Analyze the provided image and extract monster information.

Return a JSON object with the following structure:
{
  "monsters": [
    {
      "name": "Monster Name",
      "icon": "emoji that best represents this creature (e.g. 🐉, 👹, 🧟, 💀, 🐺, 🦇, 🧙, ⚔️)",
      "initiative": null,
      "maxHp": number,
      "ac": number,
      "isPlayer": false,
      "attacks": [
        {
          "name": "Attack Name",
          "attackBonus": "+X",
          "damage": "XdX+X type",
          "details": "reach, special abilities, etc."
        }
      ]
    }
  ]
}

Rules:
- Extract ALL monsters visible in the image
- initiative should always be null (rolled at game time)
- isPlayer should always be false
- For HP, use the average if a formula is shown (e.g., "52 (8d10+8)" -> use 52)
- For AC, include the armor type in details if shown
- Extract up to 3 most important attacks per monster
- Choose an appropriate emoji icon based on creature type
- If you cannot read or parse the image, return: {"monsters": [], "error": "description of issue"}

Return ONLY valid JSON, no markdown formatting or explanation.`;

// Configure the AI client based on environment
function getAIClient(): OpenAI {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";

  if (!apiKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "AI API key not configured. Set AI_API_KEY in Firebase Functions config."
    );
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

// Cloud Function to scan monster image
export const scanMonsterImage = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be logged in to use AI scanning."
    );
  }

  const { imageBase64, mimeType } = data;

  if (!imageBase64) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Image data is required."
    );
  }

  try {
    const client = getAIClient();
    const model = process.env.AI_MODEL || "gemini-2.0-flash";

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
            {
              type: "text",
              text: "Extract monster stats from this image.",
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response
    let parsed;
    try {
      // Remove any markdown code blocks if present
      const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to parse AI response as JSON"
      );
    }

    // Validate the response structure
    if (!parsed.monsters || !Array.isArray(parsed.monsters)) {
      if (parsed.error) {
        return { monsters: [], error: parsed.error };
      }
      throw new functions.https.HttpsError(
        "internal",
        "Invalid response structure from AI"
      );
    }

    return parsed;
  } catch (error) {
    console.error("AI scanning error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      `AI scanning failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
});

// Optional: Cleanup old rooms (can be scheduled)
export const cleanupOldRooms = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const db = admin.firestore();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

    const snapshot = await db
      .collection("rooms")
      .where("createdAt", "<", cutoff)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(`Deleted ${snapshot.size} old rooms`);
    return null;
  });
