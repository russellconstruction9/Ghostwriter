
import React, { useState, useEffect, useRef } from 'react';
import { BookProject, BookOutline, ChapterContent, WritingStyle } from '../types';
import { generateOutline, generateImage } from '../services/gemini';
import { SourceInput } from './SourceInput';
import { OutlineBuilder } from './OutlineBuilder';
import { BookReader } from './BookReader';
import { BookOpen, PenTool, FileAudio, ArrowRight, ChevronLeft, Check, Wand2, Feather, AlertTriangle } from 'lucide-react';

interface ProjectEditorProps {
  project: BookProject;
  onUpdateProject: (project: BookProject) => void;
  onBack: () => void;
  onStartGeneration: (style: WritingStyle) => void;
  isGeneratingGlobal: boolean;
}

const STEPS = [
  { id: 0, title: 'Materials', icon: FileAudio },
  { id: 1, title: 'Outline', icon: BookOpen },
  { id: 2, title: 'Manuscript', icon: PenTool },
];

const WRITING_STYLES: {id: WritingStyle, name: string, description: string}[] = [
  { id: 'standard', name: 'Balanced', description: 'Clear, engaging, and professional.' },
  { id: 'literary', name: 'Literary', description: 'Rich descriptions, metaphoric, and elevated prose.' },
  { id: 'humorous', name: 'Witty', description: 'Light-hearted, clever, and entertaining.' },
  { id: 'sarcastic', name: 'Edgy', description: 'Sharp wit, heavy sarcasm, and adult humor.' },
  { id: 'technical', name: 'Technical', description: 'Precise, factual, and educational.' },
  { id: 'simple', name: 'Accessible', description: 'Easy to read, simple vocabulary, direct.' },
];

export const ProjectEditor: React.FC<ProjectEditorProps> = ({ 
  project, 
  onUpdateProject, 
  onBack,
  onStartGeneration,
  isGeneratingGlobal 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [localTitle, setLocalTitle] = useState(project.title);
  const [selectedStyle, setSelectedStyle] = useState<WritingStyle>('standard');
  const [error, setError] = useState<string | null>(null);

  // Sync title state if project changes externally
  useEffect(() => {
    setLocalTitle(project.title);
  }, [project.id, project.title]);

  // Auto-start generation when entering Step 2 if chapters are empty
  useEffect(() => {
    if (project.currentStep === 2 && project.outline && project.chapters.length === 0 && !isProcessing && !isGeneratingGlobal && !error) {
      onStartGeneration(selectedStyle);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.currentStep, project.outline]);

  const updateProject = (updates: Partial<BookProject>) => {
    onUpdateProject({
      ...project,
      ...updates,
      lastModified: Date.now()
    });
  };

  const handleTitleBlur = () => {
     if (localTitle !== project.title) {
       updateProject({ title: localTitle });
     }
  };

  const handleCreateOutline = async () => {
    if (project.sources.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const generatedOutline = await generateOutline(project.sources);
      updateProject({
        outline: generatedOutline,
        chapters: [], // Reset chapters if outline changes
        currentStep: 1,
        title: generatedOutline.title
      });
      setLocalTitle(generatedOutline.title);
    } catch (e: any) {
      setError(e.message || "Failed to generate outline.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateCover = async () => {
    if (!project.outline) return;
    setIsProcessing(true);
    setError(null);
    try {
      const prompt = `A professional, high-quality book cover for a book titled "${project.outline.title}". 
      Description: ${project.outline.description}. 
      Style: Minimalist, modern, striking typography, best-selling aesthetic.`;
      
      const base64Image = await generateImage(prompt, '1:1'); 
      updateProject({
        outline: {
          ...project.outline,
          coverImage: base64Image
        }
      });
    } catch (e: any) {
      console.error("Cover generation failed", e);
      setError("Failed to generate cover image. " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateOutline = (updatedOutline: BookOutline) => {
    updateProject({ outline: updatedOutline });
  };

  const navigateStep = (step: number) => {
    if (step < project.currentStep) {
      updateProject({ currentStep: step });
    } else if (step === project.currentStep) {
      // do nothing
    } else {
      if (step === 1 && project.outline) updateProject({ currentStep: 1 });
      if (step === 2 && project.outline && project.chapters.length > 0) updateProject({ currentStep: 2 });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col print:block text-slate-900">
      
      {/* Top Bar */}
      <div className="h-16 border-b border-slate-200 flex items-center px-4 md:px-6 bg-white/80 backdrop-blur-md sticky top-0 z-50 print:hidden no-print">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium group shrink-0"
        >
          <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="hidden sm:inline">Library</span>
        </button>
        
        <div className="h-5 w-px bg-slate-200 mx-2 md:mx-4 shrink-0"></div>

        <input 
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleTitleBlur}
          className="font-serif font-bold text-lg text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-0 px-3 py-1.5 w-full max-w-lg rounded-md transition-all truncate"
        />

        <div className="flex-1"></div>

        {/* Step Progress */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100 shrink-0">
            {STEPS.map((step, idx) => {
               const isActive = project.currentStep === step.id;
               const isCompleted = project.currentStep > step.id;
               const canClick = isCompleted || isActive;

               return (
                 <button
                   key={step.id}
                   onClick={() => canClick && navigateStep(step.id)}
                   disabled={!canClick}
                   className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                     isActive ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 
                     isCompleted ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-400 cursor-not-allowed'
                   }`}
                 >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${isActive ? 'bg-blue-100 text-blue-700' : isCompleted ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {isCompleted ? <Check size={8} strokeWidth={3} /> : idx + 1}
                    </span>
                    {step.title}
                 </button>
               )
            })}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 bg-white overflow-y-auto print:overflow-visible scrollbar-hide">
        {error && (
            <div className="bg-red-50 border-b border-red-200 p-4 sticky top-0 z-40 flex items-center gap-3 animate-in slide-in-from-top-2">
                <AlertTriangle className="text-red-600 shrink-0" size={20} />
                <div className="flex-1 text-red-800 text-sm font-medium">{error}</div>
                <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 font-bold text-sm">Dismiss</button>
            </div>
        )}

        <div className={`mx-auto print:p-0 print:max-w-none transition-all ${project.currentStep === 2 && project.outline ? 'max-w-full p-0 md:px-6 md:py-12 md:max-w-6xl' : 'max-w-6xl px-4 py-8 md:px-6 md:py-12'}`}>
          
          {project.currentStep === 0 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 print:hidden max-w-4xl mx-auto no-print">
              <div className="mb-10 text-center">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                   <FileAudio size={24} />
                </div>
                <h2 className="text-3xl font-serif font-bold text-slate-900 mb-3">Source Material</h2>
                <p className="text-slate-500 text-lg max-w-xl mx-auto leading-relaxed">Gather your raw thoughts, recordings, and notes. This is the clay we will sculpt into your story.</p>
              </div>
              
              <SourceInput 
                sources={project.sources} 
                onUpdate={(newSources) => updateProject({ sources: newSources })} 
              />
              
              <div className="mt-12 bg-slate-50 border border-slate-100 rounded-xl p-6">
                 <div className="flex items-center gap-2 mb-4">
                    <Feather size={18} className="text-blue-600" />
                    <h3 className="font-bold text-slate-800">Choose Writing Style</h3>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {WRITING_STYLES.map(style => (
                       <button
                         key={style.id}
                         onClick={() => setSelectedStyle(style.id)}
                         className={`text-left p-3 rounded-lg border transition-all ${selectedStyle === style.id ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'}`}
                       >
                          <div className={`font-bold text-sm mb-1 ${selectedStyle === style.id ? 'text-blue-700' : 'text-slate-700'}`}>{style.name}</div>
                          <div className="text-xs text-slate-500 leading-snug">{style.description}</div>
                       </button>
                    ))}
                 </div>
              </div>

              <div className="flex justify-center pt-12 mt-8 border-t border-slate-100">
                <button 
                  onClick={handleCreateOutline}
                  disabled={project.sources.length === 0 || isProcessing || project.sources.some(s => s.isProcessing)}
                  className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white pl-8 pr-6 py-4 rounded-full font-bold text-lg transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-1 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed disabled:translate-y-0"
                >
                  {isProcessing ? 'Analyzing...' : 'Generate Structure'}
                  {!isProcessing && <div className="bg-blue-500 rounded-full p-1"><ArrowRight size={16} /></div>}
                </button>
              </div>
            </div>
          )}

          {project.currentStep === 1 && project.outline && (
            <div className="animate-in fade-in slide-in-from-bottom-2 print:hidden no-print">
               <OutlineBuilder 
                 outline={project.outline} 
                 isGenerating={isProcessing && !project.outline} 
                 onRegenerate={handleCreateOutline}
                 onGenerateCover={handleGenerateCover}
                 onUpdateOutline={handleUpdateOutline}
               />
               
               <div className="flex flex-col items-center pt-16 pb-8">
                  <button 
                   onClick={() => updateProject({ currentStep: 2 })}
                   className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white pl-8 pr-6 py-4 rounded-full font-bold text-lg transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-1"
                 >
                   Start Writing Manuscript
                   <div className="bg-blue-500 rounded-full p-1"><Wand2 size={16} /></div>
                 </button>
                 <p className="text-sm text-slate-400 mt-4 font-medium">
                    This process may take a few moments per chapter.
                  </p>
               </div>
            </div>
          )}

          {project.currentStep === 2 && project.outline && (
            <BookReader 
              outline={project.outline} 
              chapters={project.chapters} 
              selectedVoice={project.audioVoice || 'Kore'}
              onVoiceChange={(voice) => updateProject({ audioVoice: voice })}
              onChapterUpdate={(updatedChapter) => {
                 const newChapters = project.chapters.map(c => c.chapterNumber === updatedChapter.chapterNumber ? updatedChapter : c);
                 updateProject({ chapters: newChapters });
              }}
              onUpdateOutline={handleUpdateOutline}
            />
          )}

        </div>
      </div>
    </div>
  );
};
