import { GoogleGenAI, Type } from "@google/genai";
import { DetectionResult } from "../types";

export class GeminiAudioService {
  async verifyAnomaly(base64Audio: string, mimeType: string): Promise<{ isRealAnomaly: boolean; reason: string }> {
    try {
      // DO: Initialize the GoogleGenAI instance right before use to ensure the most up-to-date API key is used
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        // Using the recommended model for native audio analysis tasks
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Audio,
                mimeType: mimeType,
              },
            },
            {
              text: `Analyze this audio snippet from a factory floor. A statistical anomaly was detected.
              Determine if this is a:
              1. GENUINE MECHANICAL FAILURE (grinding, bearing failure, irregular RPM).
              2. HUMAN SPEECH / BACKGROUND NOISE (people talking, shouting, music, non-mechanical noise).
              
              Return JSON with "isRealAnomaly" (boolean) and "reason" (string).`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isRealAnomaly: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
            },
            required: ["isRealAnomaly", "reason"],
          },
        },
      });

      // DO: Use the .text property directly to access the generated text
      const result = JSON.parse(response.text?.trim() || '{}');
      return {
        isRealAnomaly: result.isRealAnomaly,
        reason: result.reason || "Brak szczegółów"
      };
    } catch (error) {
      console.error("Gemini Verification Error:", error);
      return { isRealAnomaly: true, reason: "Błąd weryfikacji - traktuję jako alarm" };
    }
  }
}

export const geminiService = new GeminiAudioService();
