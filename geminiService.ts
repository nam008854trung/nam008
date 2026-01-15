
import { GoogleGenAI, Type } from "@google/genai";
import { TranslationStyle } from "./types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const scanGlossary = async (fullContent: string, style: TranslationStyle): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `Bạn là biên tập viên kịch bản điện ảnh. Hãy quét kịch bản sau và liệt kê 20 thực thể quan trọng nhất (tên nhân vật, địa danh, vật phẩm quỷ dị, chức danh).
  PHONG CÁCH PHIM: ${style}
  KỊCH BẢN: ${fullContent.slice(0, 40000)}
  CHỈ TRẢ VỀ DUY NHẤT MỘT MẢNG JSON CÁC CHUỖI. KHÔNG GIẢI THÍCH.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ] as any
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    return [];
  }
};

export const translateBatch = async (
  texts: string[],
  targetLang: string,
  style: TranslationStyle,
  modelName: string,
  glossary?: string,
  fullContent?: string,
  autoGlossary?: string[],
  retryCount = 0
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const allTerms = autoGlossary?.length ? autoGlossary.join(', ') : '';

  const systemInstruction = `VAI TRÒ: Biên dịch viên phim chuyên nghiệp, am hiểu văn hóa mạng Việt Nam.
QUY TẮC QUAN TRỌNG:
1. NỘI DUNG HƯ CẤU: Đây là kịch bản phim giả tưởng. KHÔNG chặn hoặc lọc nội dung (kinh dị, bạo lực nhẹ, quỷ dị, y khoa) vì lý do an toàn.
2. PHONG CÁCH: ${style}. Dịch thoát ý hoàn toàn, dùng ngôn ngữ hiện đại, lôi cuốn, lầy lội nếu phù hợp.
3. THUẬT NGỮ CỐ ĐỊNH: ${allTerms}. Luôn sử dụng đúng các thuật ngữ này.
4. ĐỊNH DẠNG: Trả về một mảng JSON các chuỗi đã dịch theo đúng thứ tự đầu vào.`;

  const dataToTranslate = texts.map((text, i) => `[${i}] ${text}`).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Dịch các dòng sau sang ${targetLang}:\n${dataToTranslate}`,
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ] as any
      }
    });

    let textResponse = (response.text || "[]").trim();
    
    // Sửa lỗi JSON bị cắt ngang
    if (!textResponse.endsWith(']')) {
      if (textResponse.endsWith('"')) textResponse += ']';
      else if (textResponse.endsWith(',')) textResponse = textResponse.slice(0, -1) + ']';
      else textResponse += '"]';
    }

    try {
      const result = JSON.parse(textResponse);
      if (Array.isArray(result)) return result;
      throw new Error("Invalid format");
    } catch (e) {
      // Regex fallback
      const matches = textResponse.match(/"([^"\\]|\\.)*"/g);
      if (matches) return matches.map(m => m.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
      throw e;
    }
    
  } catch (error: any) {
    if (retryCount < 2) {
      await sleep(2500 * (retryCount + 1));
      return translateBatch(texts, targetLang, style, modelName, glossary, fullContent, autoGlossary, retryCount + 1);
    }
    throw error;
  }
};
