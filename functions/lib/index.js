"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupOldRooms = exports.scanMonsterImage = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const openai_1 = __importDefault(require("openai"));
admin.initializeApp();
// Get region from environment or default to australia-southeast1
const REGION = process.env.FUNCTIONS_REGION || "australia-southeast1";
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
function getAIClient() {
    const apiKey = process.env.AI_API_KEY;
    const baseURL = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";
    if (!apiKey) {
        throw new functions.https.HttpsError("failed-precondition", "AI API key not configured. Set AI_API_KEY in Firebase Functions config.");
    }
    return new openai_1.default({
        apiKey,
        baseURL,
    });
}
// Cloud Function to scan monster image
exports.scanMonsterImage = functions
    .region(REGION)
    .runWith({
    secrets: ["AI_API_KEY", "AI_BASE_URL"],
})
    .https.onCall(async (data, context) => {
    var _a, _b;
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in to use AI scanning.");
    }
    const { imageBase64, mimeType } = data;
    if (!imageBase64) {
        throw new functions.https.HttpsError("invalid-argument", "Image data is required.");
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
        const content = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!content) {
            throw new Error("No response from AI");
        }
        // Parse the JSON response
        let parsed;
        try {
            // Remove any markdown code blocks if present
            const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
            parsed = JSON.parse(jsonStr);
        }
        catch (parseError) {
            console.error("Failed to parse AI response:", content);
            throw new functions.https.HttpsError("internal", "Failed to parse AI response as JSON");
        }
        // Validate the response structure
        if (!parsed.monsters || !Array.isArray(parsed.monsters)) {
            if (parsed.error) {
                return { monsters: [], error: parsed.error };
            }
            throw new functions.https.HttpsError("internal", "Invalid response structure from AI");
        }
        return parsed;
    }
    catch (error) {
        console.error("AI scanning error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", `AI scanning failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
});
// Optional: Cleanup old rooms (can be scheduled)
exports.cleanupOldRooms = functions.pubsub
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
//# sourceMappingURL=index.js.map