import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AIResult {
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
}

export async function generateAICreative(
  pdfPageBase64: string,
  mode: 'photo' | 'animation'
): Promise<AIResult> {
  console.log(`[AIUtils] Starting creative generation for mode: ${mode}`);
  
  try {
    // Step 1: Analyze the PDF page to get a creative prompt
    const analysisResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: pdfPageBase64,
                mimeType: "image/png"
              }
            },
            {
              text: `Analyze this PDF page. Based on its content, theme, and visual style, generate a highly descriptive and artistic prompt for an AI ${mode === 'photo' ? 'photograph' : 'cinematic animation'}. 
              The prompt should capture the essence of the document but be a "real world" representation. 
              Return ONLY the prompt text.`
            }
          ]
        }
      ]
    });

    const prompt = analysisResponse.text?.trim() || "A professional representation of the document content.";
    console.log(`[AIUtils] Generated prompt: ${prompt}`);

    if (mode === 'photo') {
      // Step 2: Generate Image
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let imageUrl: string | undefined;
      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      return { imageUrl, prompt };
    } else {
      // Step 2: Generate Video (Animation)
      const operation = await ai.models.generateVideos({
        model: 'veo-3.1-lite-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      console.log(`[AIUtils] Video generation started, operation ID: ${(operation as any).id}`);

      // Poll for completion
      let currentOp = operation;
      while (!currentOp.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        currentOp = await (ai.operations as any).get((operation as any).id);
        console.log(`[AIUtils] Video generation progress: ${currentOp.done ? 'Done' : 'Processing...'}`);
      }

      const videoUrl = (currentOp.response as any)?.videos?.[0]?.uri;
      return { videoUrl, prompt };
    }
  } catch (error) {
    console.error(`[AIUtils] Error in AI generation:`, error);
    throw error;
  }
}
