import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeImage(base64Data: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: "Analyze this image and provide: 1. A list of objects/tags (comma separated). 2. Any text found in the image (OCR). 3. If there are people, describe them briefly. Return as JSON." },
            { inlineData: { data: base64Data, mimeType } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            ocrText: { type: Type.STRING },
            peopleDescription: { type: Type.STRING }
          }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return null;
  }
}

export async function chatWithFile(fileContent: string, fileName: string, userMessage: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `The following is the content of a file named "${fileName}":\n\n${fileContent}\n\nUser Question: ${userMessage}`,
      config: {
        systemInstruction: "You are an AI assistant that helps users understand their files. Be concise and accurate."
      }
    });
    return response.text;
  } catch (error) {
    console.error("AI Chat Error:", error);
    return "Sorry, I couldn't analyze the file at this moment.";
  }
}

export async function semanticSearch(query: string, fileList: any[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Given this list of files: ${JSON.stringify(fileList.map(f => ({ name: f.fileName, tags: f.aiTags, ocr: f.ocrText })))}\n\nFind the files that best match the query: "${query}". Return only the file IDs as a JSON array.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("AI Search Error:", error);
    return [];
  }
}
