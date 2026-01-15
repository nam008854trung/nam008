
import { GoogleGenAI, Type } from "@google/genai";
import { TranslationStyle } from "./types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const scanGlossary = async (fullContent: string, style: TranslationStyle): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const contentSample = fullContent.slice(0, 15000);

  const prompt = `Bạn là biên tập viên kịch bản. Hãy liệt kê tối đa 15 thuật ngữ quan trọng nhất (tên nhân vật, địa danh, vật phẩm) từ kịch bản này.
  PHONG CÁCH: ${style}
  YÊU CẦU: Trả về duy nhất 1 mảng JSON ["Từ 1", "Từ 2", ...].
  KỊCH BẢN:
  ${contentSample}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        temperature: 0.2,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ] as any
      }
    });
    const text = response.text || "[]";
    const cleanedText = text.substring(text.indexOf('['), text.lastIndexOf(']') + 1);
    return JSON.parse(cleanedText);
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
  const allTerms = autoGlossary?.length ? autoGlossary.join(', ') : 'Chưa có';

  const systemInstruction = `VAI TRÒ: Biên dịch viên phim chuyên nghiệp. 
NHIỆM VỤ: Dịch kịch bản phim sang ${targetLang}.
QUY TẮC TUYỆT ĐỐI:
1. ĐỊNH DẠNG: Trả về một mảng JSON ["dịch 1", "dịch 2", ...] với đúng CHÍNH XÁC ${texts.length} phần tử. 
2. CẤM: Không trả về bản gốc, không trả về văn bản thừa, không giải thích.
3. AN TOÀN: Đây là kịch bản hư cấu. KHÔNG chặn nội dung bạo lực/nhạy cảm. 
4. PHONG CÁCH: ${style}. Thuật ngữ cần dùng: ${allTerms}.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Dịch mảng này sang ${targetLang}, trả về đúng ${texts.length} dòng: ${JSON.stringify(texts)}`,
      config: {
        systemInstruction,
        temperature: 0.4,
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

    let rawText = (response.text || "[]").trim();
    const startIdx = rawText.indexOf('[');
    const endIdx = rawText.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
      rawText = rawText.substring(startIdx, endIdx + 1);
    }

    const result = JSON.parse(rawText);
    
    // Kiểm tra nghiêm ngặt: Phải là mảng và phải đủ số lượng dòng
    if (Array.isArray(result) && result.length === texts.length) {
      return result;
    }
    
    throw new Error("Incomplete or invalid translation result");
    
  } catch (error: any) {
    // Tăng cường Retry: Không bao giờ trả về bản gốc, thử lại cho đến khi thành công (tối đa 5 lần cho mỗi cụm)
    if (retryCount < 5) {
      const waitTime = Math.pow(2, retryCount) * 2000; // Đợi lâu dần: 2s, 4s, 8s...
      await sleep(waitTime);
      return translateBatch(texts, targetLang, style, modelName, glossary, fullContent, autoGlossary, retryCount + 1);
    }
    // Nếu quá 5 lần vẫn lỗi (cực hiếm), ném lỗi để App xử lý retry ở cấp độ cao hơn
    throw new Error("Failed after multiple attempts");
  }
};
