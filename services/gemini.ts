import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";
import { BookOutline, ChapterOutline, Source, SourceType, WritingStyle } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Models
const MODEL_FAST = 'gemini-2.5-flash';
const MODEL_SMART = 'gemini-3-pro-preview';
// Upgraded to Pro Image model for high-quality covers
const MODEL_IMAGE = 'gemini-3-pro-image-preview';
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

const isFatalError = (error: any): boolean => {
  const msg = error?.message || '';
  const status = error?.status;
  // Fail fast on permission denied (leaked key, no quota, etc)
  if (status === 403 || status === 401) return true;
  if (msg.includes('leaked') || msg.includes('API key') || msg.includes('PERMISSION_DENIED')) return true;
  return false;
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Audio,
              mimeType: mimeType
            }
          },
          {
            text: "Transcribe the following audio precisely. Return only the transcript text."
          }
        ]
      }
    });
    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

export const generateOutline = async (sources: Source[]): Promise<BookOutline> => {
  const parts: any[] = [];

  // 1. System Instruction / Goal
  parts.push({
    text: `You are a professional book editor. Analyze the provided source materials to create a comprehensive book outline.
    
    The source material may include text notes, audio transcripts, and visual references (images).
    Your job is to find the narrative arc, themes, and key events to structure a cohesive non-fiction or fiction book.
    
    If images are provided, incorporate their visual details (settings, characters, mood) into the descriptions and summaries.`
  });

  // 2. Add Sources
  for (const source of sources) {
    if (source.type === SourceType.TEXT) {
      parts.push({ text: `\n\n--- Source: ${source.name} (Notes) ---\n${source.content}` });
    } else if (source.type === SourceType.AUDIO && source.transcription) {
      parts.push({ text: `\n\n--- Source: ${source.name} (Transcript) ---\n${source.transcription}` });
    } else if (source.type === SourceType.IMAGE) {
       parts.push({ text: `\n\n--- Source: ${source.name} (Visual Reference) ---` });
       parts.push({
         inlineData: {
           data: source.content,
           mimeType: source.mimeType || 'image/jpeg'
         }
       });
    }
  }

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "A creative and engaging title for the book." },
      description: { type: Type.STRING, description: "A synopsis of the book." },
      chapters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            chapterNumber: { type: Type.INTEGER },
            title: { type: Type.STRING },
            summary: { type: Type.STRING, description: "Detailed plot points to cover in this chapter." }
          },
          required: ["chapterNumber", "title", "summary"]
        }
      }
    },
    required: ["title", "description", "chapters"]
  };

  try {
    const response = await ai.models.generateContent({
      model: MODEL_SMART,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });
    
    if (!response.text) throw new Error("No response generated");
    return JSON.parse(response.text) as BookOutline;
  } catch (error) {
    console.error("Outline generation error:", error);
    if (isFatalError(error)) throw error;
    throw new Error("Failed to generate outline.");
  }
};

export const generateImage = async (prompt: string, aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16" = "1:1"): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_IMAGE,
      contents: {
        parts: [
          { text: prompt }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "1K" // Required for Pro Image model
        }
      }
    });

    if (response.candidates) {
      for (const candidate of response.candidates) {
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              return part.inlineData.data;
            }
          }
        }
      }
    }
    
    if (response.promptFeedback?.blockReason) {
        throw new Error(`Image generation blocked: ${response.promptFeedback.blockReason}`);
    }
    
    throw new Error("No image data found in response.");
  } catch (error) {
    console.error("Image generation error:", error);
    if (isFatalError(error)) throw error;
    throw new Error("Failed to generate image.");
  }
};

export const writeChapter = async (
  chapter: ChapterOutline,
  outline: BookOutline,
  sources: Source[],
  style: WritingStyle = 'standard'
): Promise<string> => {
   
   const parts: any[] = [];
   
   // Context Header
   let contextIntro = `You are a best-selling author. Write the full content for Chapter ${chapter.chapterNumber}: "${chapter.title}".
         
   Book Title: ${outline.title}
   Book Description: ${outline.description}
   
   Chapter Summary/Goals: ${chapter.summary}`;

   const styleInstructions: Record<string, string> = {
     'standard': 'Write in a clear, engaging, and professional manner.',
     'literary': 'Use rich descriptions, metaphors, and elevated prose.',
     'humorous': 'Be witty, light-hearted, and entertaining.',
     'technical': 'Be precise, factual, and educational.',
     'simple': 'Use simple vocabulary and direct sentence structures for high readability.',
     'sarcastic': 'Write in a highly sarcastic, witty manner with adult humor and a cynical, sharp tone. Do not be afraid to be edgy.'
   };

   contextIntro += `\n\nWriting Style: ${styleInstructions[style] || styleInstructions['standard']}
   
   Instructions:
   - Write in an engaging, high-quality literary style matching the requested tone.
   - Ensure continuity with the overall book theme.
   - Use the source material as the factual/narrative basis but expand creatively.
   - Format with Markdown (headers, paragraphs).
   - If images are provided in the source material, use them to vividly describe scenes, characters, or items.`;

   parts.push({ text: contextIntro });

   // Add Sources
   for (const source of sources) {
      if (source.type === SourceType.TEXT) {
        parts.push({ text: `\n[Source: ${source.name}]: ${source.content.slice(0, 5000)}` });
      } else if (source.type === SourceType.AUDIO && source.transcription) {
        parts.push({ text: `\n[Source: ${source.name}]: ${source.transcription.slice(0, 5000)}` });
      } else if (source.type === SourceType.IMAGE) {
        parts.push({ text: `\n[Source: ${source.name} (Image Reference)]` });
        parts.push({
          inlineData: {
             data: source.content,
             mimeType: source.mimeType || 'image/jpeg'
          }
        });
      }
   }
 
   let attempt = 0;
   const maxAttempts = 3;

   while (attempt < maxAttempts) {
     try {
       const response = await ai.models.generateContent({
         model: MODEL_SMART,
         contents: { parts }
       });
   
       return response.text || "";
     } catch (error: any) {
        console.error(`Attempt ${attempt + 1} failed for chapter ${chapter.chapterNumber}:`, error);

        // Check for fatal errors that shouldn't be retried
        if (isFatalError(error)) {
           throw error; // Stop immediately, do not retry
        }

        attempt++;
        if (attempt >= maxAttempts) {
             throw new Error(`Failed to write chapter ${chapter.chapterNumber}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
     }
   }
   return "";
};

export const refineChapterText = async (currentContent: string, instruction: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_FAST, // Use fast model for editing/polishing
      contents: {
        parts: [
          {
            text: `You are an expert book editor.
            
            Task: ${instruction}
            
            Current Text:
            ${currentContent}
            
            Return ONLY the rewritten text in Markdown format. Do not add conversational filler.`
          }
        ]
      }
    });
    return response.text || currentContent;
  } catch (error) {
    console.error("Refine text error:", error);
    if (isFatalError(error)) throw error;
    throw error;
  }
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TTS,
      contents: {
        parts: [{ text: text }]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error("No audio data generated");
    }
    return audioData;
  } catch (error) {
    console.error("TTS generation error:", error);
    return "";
  }
};