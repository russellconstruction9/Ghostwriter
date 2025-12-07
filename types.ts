

export enum SourceType {
  AUDIO = 'AUDIO',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE'
}

export interface Source {
  id: string;
  type: SourceType;
  content: string; // Text content or Base64 audio/image string
  mimeType?: string; // For audio/image
  name: string;
  transcription?: string; // If audio, the transcribed text
  isProcessing: boolean;
}

export interface ChapterOutline {
  chapterNumber: number;
  title: string;
  summary: string;
}

export type WritingStyle = 'standard' | 'literary' | 'humorous' | 'technical' | 'simple' | 'sarcastic';

export interface BookOutline {
  title: string;
  description: string;
  chapters: ChapterOutline[];
  coverImage?: string;
  backCoverImage?: string;
}

export interface ChapterContent {
  chapterNumber: number;
  title: string;
  content: string;
  isGenerating: boolean;
}

export interface BookProject {
  id: string;
  title: string;
  lastModified: number;
  sources: Source[];
  outline: BookOutline | null;
  chapters: ChapterContent[];
  currentStep: number; // 0: Sources, 1: Outline, 2: Writing, 3: Read
  seriesId?: string;
  seriesIndex?: number;
  audioVoice?: string; // Preferred voice for TTS
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  EDITOR = 'EDITOR'
}