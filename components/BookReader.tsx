
import React, { useState, useRef, useEffect } from 'react';
import { ChapterContent, BookOutline } from '../types';
import { ChevronLeft, ChevronRight, Loader2, Download, PenLine, Save, Headphones, Play, Square, FileText, CheckCircle2, Image as ImageIcon, Sparkles, Wand2, Menu, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateSpeech, generateImage, refineChapterText } from '../services/gemini';

interface BookReaderProps {
  outline: BookOutline;
  chapters: ChapterContent[];
  onChapterUpdate?: (chapter: ChapterContent) => void;
  selectedVoice?: string;
  onVoiceChange?: (voice: string) => void;
  onUpdateOutline?: (outline: BookOutline) => void;
}

const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxntoxi2DILyS_K3zQlZx9DSUDMupWW9x_p4sfWkCsKzB1Yv38SVSaylfVIX_bAOp4_/exec";

// Helpers for Gemini Audio (PCM)
function decode(base64: string) {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Audio decoding failed", e);
    return new Uint8Array(0);
  }
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  
  // Create a buffer at the SOURCE sample rate (24kHz).
  // The AudioContext (which might be 48kHz) will handle resampling automatically during playback.
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert int16 to float [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const BookReader: React.FC<BookReaderProps> = ({ 
  outline, 
  chapters, 
  onChapterUpdate, 
  selectedVoice, 
  onVoiceChange,
  onUpdateOutline
}) => {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Default open
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDocs, setIsExportingDocs] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [polishInstruction, setPolishInstruction] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [isCoverGenerating, setIsCoverGenerating] = useState(false);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const currentChapter = chapters[currentChapterIndex];

  // Stop audio on unmount or chapter change
  useEffect(() => {
    stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapterIndex]);

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch(e) {}
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const playChapterAudio = async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }
    
    if (!currentChapter?.content) return;

    // CRITICAL FIX FOR MOBILE AUDIO
    // 1. Do NOT force sampleRate in constructor. Let the phone choose (usually 48k or 44.1k).
    // 2. Play a silent buffer IMMEDIATELY to unlock the audio engine on iOS.
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;

      // Resume context if suspended (common in browsers to prevent auto-play)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Play 1 sample of silence to physically engage the speakers immediately
      const silentBuffer = ctx.createBuffer(1, 1, 22050);
      const silentSource = ctx.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(ctx.destination);
      silentSource.start(0);

    } catch (e) {
      console.error("Failed to initialize audio context", e);
      alert("Could not initialize audio system. Please check your device volume/permissions.");
      return;
    }
    
    setAudioLoading(true);
    
    try {
      // Fetch 24kHz audio from Gemini
      const pcmBase64 = await generateSpeech(currentChapter.content.slice(0, 5000), selectedVoice || 'Kore');
      
      const audioCtx = audioContextRef.current;
      if (!audioCtx) throw new Error("Audio context lost");

      const pcmData = decode(pcmBase64);
      // Decode the 24kHz data into a buffer. 
      // The context (likely 48kHz) will resample this buffer automatically during playback.
      const audioBuffer = await decodeAudioData(pcmData, audioCtx, 24000);
      
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.onended = () => setIsPlaying(false);
      
      audioSourceRef.current = source;
      source.start();
      setIsPlaying(true);

    } catch (err) {
      console.error("Audio playback failed", err);
      alert("Failed to play audio. Please try again.");
    } finally {
      setAudioLoading(false);
    }
  };

  const handlePrintPDF = async () => {
    setIsExporting(true);
    
    // Allow React to render the export view
    await new Promise(resolve => setTimeout(resolve, 500));

    // @ts-ignore
    if (!window.html2pdf) {
        alert("PDF generator not loaded. Please refresh.");
        setIsExporting(false);
        return;
    }

    const element = document.getElementById('pdf-content-to-print');
    if (!element) {
        alert("Could not prepare document for export.");
        setIsExporting(false);
        return;
    }

    const opt = {
      margin: 0, 
      filename: `${outline.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'px', format: [816, 1056], orientation: 'portrait' } // Fixed pixel dimensions (8.5x11 @ 96dpi)
    };

    try {
        // @ts-ignore
        await window.html2pdf().set(opt).from(element).save();
    } catch (e) {
        console.error("PDF generation failed", e);
        alert("Failed to generate PDF. Please try again.");
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportDocs = async () => {
    setIsExportingDocs(true);
    
    const scriptUrl = prompt("Enter Google Apps Script URL (see google_apps_script_template.js):", DEFAULT_SCRIPT_URL);
    if (!scriptUrl) {
      setIsExportingDocs(false);
      return;
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: outline.title,
          description: outline.description,
          chapters: chapters.map(c => ({
            chapterNumber: c.chapterNumber,
            title: c.title,
            content: c.content
          }))
        })
      });
      alert("Export request sent! Check your Google Drive root folder in a few moments.");
    } catch (e) {
      console.error(e);
      alert("Export failed. Check console for details.");
    } finally {
      setIsExportingDocs(false);
    }
  };

  const startEditing = () => {
    if (!currentChapter) return;
    setEditContent(currentChapter.content);
    setIsEditing(true);
  };

  const saveEditing = () => {
    if (!currentChapter || !onChapterUpdate) return;
    onChapterUpdate({
      ...currentChapter,
      content: editContent
    });
    setIsEditing(false);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setPolishInstruction('');
  };

  const handlePolish = async () => {
    if (!polishInstruction.trim()) return;
    setIsPolishing(true);
    try {
      const polished = await refineChapterText(editContent, polishInstruction);
      setEditContent(polished);
      setPolishInstruction('');
    } catch (e) {
      console.error(e);
      alert("Failed to polish text.");
    } finally {
      setIsPolishing(false);
    }
  };

  const handleGenerateCover = async () => {
    if (!onUpdateOutline) return;
    setIsCoverGenerating(true);
    try {
      const prompt = `A professional, high-quality book cover for a book titled "${outline.title}". 
      Description: ${outline.description}. 
      Style: Minimalist, modern, striking typography, best-selling aesthetic.`;
      
      const base64Image = await generateImage(prompt, '1:1');
      onUpdateOutline({
        ...outline,
        coverImage: base64Image
      });
    } catch (e) {
      console.error(e);
      alert("Failed to generate cover.");
    } finally {
      setIsCoverGenerating(false);
    }
  };

  const handleChapterSelect = (idx: number) => {
    setCurrentChapterIndex(idx);
    // On mobile, close sidebar automatically after selection for better UX
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-slate-50 relative overflow-hidden">
        
        {/* Sidebar */}
        <div className={`
            flex-col bg-white border-r border-slate-200 flex-shrink-0 transition-all duration-300 z-30
            ${isSidebarOpen ? 'fixed inset-0 w-full flex md:static md:w-80' : 'hidden md:flex md:w-0 md:overflow-hidden'}
        `}>
          <div className="p-6 border-b border-slate-100 flex-shrink-0 flex justify-between items-start">
             <div className="overflow-hidden">
               <h3 className="font-bold text-slate-900 font-serif mb-1 truncate">{outline.title}</h3>
               <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Table of Contents</p>
             </div>
             {/* Close button for mobile sidebar */}
             <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 text-slate-400 hover:text-slate-600">
               <X size={24} />
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
             {chapters.map((chap, idx) => (
               <button
                 key={chap.chapterNumber}
                 onClick={() => handleChapterSelect(idx)}
                 className={`w-full text-left p-3 rounded-lg text-sm transition-all border ${
                   currentChapterIndex === idx 
                   ? 'bg-blue-50 border-blue-200 text-blue-800 font-bold shadow-sm' 
                   : 'border-transparent hover:bg-slate-50 text-slate-600'
                 }`}
               >
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs opacity-70 uppercase tracking-wide">Chapter {chap.chapterNumber}</span>
                    {chap.isGenerating && <Loader2 size={12} className="animate-spin text-blue-500"/>}
                 </div>
                 <div className="truncate">{chap.title}</div>
               </button>
             ))}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
             <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <Headphones size={12} /> Audiobook
                </div>
                <select 
                   value={selectedVoice}
                   onChange={(e) => onVoiceChange && onVoiceChange(e.target.value)}
                   className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded mb-2 outline-none focus:border-blue-300"
                >
                  <option value="Kore">Kore (Balanced)</option>
                  <option value="Puck">Puck (Energetic)</option>
                  <option value="Fenrir">Fenrir (Deep)</option>
                  <option value="Charon">Charon (Calm)</option>
                </select>
                <button 
                  onClick={playChapterAudio}
                  disabled={audioLoading || !currentChapter || currentChapter.isGenerating}
                  className={`w-full py-2 rounded-md font-bold text-sm text-white flex items-center justify-center gap-2 transition-all ${isPlaying ? 'bg-slate-800 hover:bg-slate-900' : 'bg-blue-600 hover:bg-blue-500 shadow-sm'}`}
                >
                  {audioLoading ? <Loader2 size={14} className="animate-spin" /> : isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  {isPlaying ? 'Stop Reading' : 'Read Chapter'}
                </button>
             </div>

             <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Design & Export</div>
                
                {/* Cover Image Area */}
                <div className="mb-4">
                  {outline.coverImage ? (
                    <div className="relative group rounded-md overflow-hidden mb-2 border border-slate-100 shadow-sm">
                       <img src={`data:image/jpeg;base64,${outline.coverImage}`} alt="Cover" className="w-full h-auto object-cover aspect-square" />
                       <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={handleGenerateCover} className="text-white text-xs font-bold flex items-center gap-1 hover:underline">
                             <ImageIcon size={12} /> Regenerate
                          </button>
                       </div>
                    </div>
                  ) : (
                    <button 
                      onClick={handleGenerateCover}
                      disabled={isCoverGenerating}
                      className="w-full py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all mb-2"
                    >
                      {isCoverGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Generate Full Cover
                    </button>
                  )}
                </div>

                <button 
                  onClick={handlePrintPDF}
                  disabled={isExporting}
                  className="w-full flex items-center gap-2 text-slate-600 hover:text-blue-700 hover:bg-slate-50 p-2 rounded-md text-sm font-medium transition-colors mb-1"
                >
                  {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Download PDF E-Book
                </button>
                <button 
                  onClick={handleExportDocs}
                  disabled={isExportingDocs}
                  className="w-full flex items-center gap-2 text-slate-600 hover:text-blue-700 hover:bg-slate-50 p-2 rounded-md text-sm font-medium transition-colors"
                >
                  {isExportingDocs ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  Export to Docs
                </button>
             </div>
          </div>
        </div>

        {/* Main Content (Reader) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 relative w-full">
           
           {/* Mobile Header for Reader View */}
           <div className="md:hidden h-14 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 justify-between">
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                 <Menu size={24} />
              </button>
              <span className="font-serif font-bold text-slate-900 truncate max-w-[200px]">
                 {currentChapter ? `Ch ${currentChapter.chapterNumber}: ${currentChapter.title}` : 'Reader'}
              </span>
              <div className="w-8"></div> {/* Spacer */}
           </div>

           {/* Desktop Sidebar Toggle */}
           <div className="hidden md:block absolute top-4 left-4 z-20">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-white shadow-md rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 transition-colors">
                 {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
              </button>
           </div>

           <div className="flex-1 overflow-y-auto p-4 md:p-12 scroll-smooth">
             <div className="max-w-3xl mx-auto bg-white shadow-xl shadow-slate-200/50 min-h-[80vh] p-6 md:p-16 rounded-xl relative border border-slate-100">
                
                {/* Book Decoration */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-100 via-blue-50 to-blue-100 opacity-50"></div>

                {!currentChapter ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <Loader2 size={40} className="animate-spin mb-4 text-blue-200" />
                    <p>Loading Manuscript...</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-8 pb-8 border-b border-slate-100">
                       <span className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase mb-2 block text-center">Chapter {currentChapter.chapterNumber}</span>
                       <h2 className="text-2xl md:text-4xl font-serif font-bold text-slate-900 text-center leading-tight">{currentChapter.title}</h2>
                    </div>

                    {isEditing ? (
                       <div className="animate-in fade-in">
                          <textarea 
                             value={editContent}
                             onChange={(e) => setEditContent(e.target.value)}
                             className="w-full h-[60vh] p-4 font-serif text-lg leading-relaxed text-slate-800 border-2 border-blue-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 resize-y mb-4"
                          />
                          
                          {/* AI Polish Tool */}
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6 flex gap-3 items-center">
                             <div className="bg-blue-200 p-2 rounded-full text-blue-700"><Wand2 size={16} /></div>
                             <div className="flex-1">
                                <input 
                                  value={polishInstruction}
                                  onChange={(e) => setPolishInstruction(e.target.value)}
                                  placeholder="Ask AI to polish (e.g., 'Make it more dramatic')"
                                  className="w-full bg-white border border-blue-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400"
                                  onKeyDown={(e) => e.key === 'Enter' && handlePolish()}
                                />
                             </div>
                             <button 
                               onClick={handlePolish}
                               disabled={isPolishing || !polishInstruction.trim()}
                               className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                             >
                               {isPolishing ? <Loader2 size={16} className="animate-spin" /> : 'Refine'}
                             </button>
                          </div>

                          <div className="flex justify-end gap-3 sticky bottom-0 bg-white pt-4 border-t border-slate-100">
                             <button onClick={cancelEditing} className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded-lg">Cancel</button>
                             <button onClick={saveEditing} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-lg shadow-lg shadow-emerald-200 flex items-center gap-2">
                                <Save size={16} /> Save Changes
                             </button>
                          </div>
                       </div>
                    ) : (
                      <div className="prose prose-lg prose-slate font-serif max-w-none prose-headings:font-sans prose-headings:font-bold prose-p:leading-loose text-slate-800">
                         {currentChapter.isGenerating ? (
                           <div className="space-y-4 animate-pulse">
                              <div className="h-4 bg-slate-100 rounded w-full"></div>
                              <div className="h-4 bg-slate-100 rounded w-11/12"></div>
                              <div className="h-4 bg-slate-100 rounded w-full"></div>
                              <div className="py-8 text-center text-slate-400 text-sm font-sans flex items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin" /> Writing in progress...
                              </div>
                           </div>
                         ) : (
                           <div className="relative group min-h-[200px]">
                              <ReactMarkdown>{currentChapter.content}</ReactMarkdown>
                              <button 
                                onClick={startEditing}
                                className="absolute top-0 right-0 p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="Edit Text"
                              >
                                <PenLine size={20} />
                              </button>
                           </div>
                         )}
                      </div>
                    )}
                  </>
                )}
             </div>

             {/* Navigation Footer */}
             <div className="max-w-3xl mx-auto mt-8 flex justify-between items-center text-sm font-medium text-slate-500 pb-24 md:pb-12 px-4">
                <button 
                  onClick={() => setCurrentChapterIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentChapterIndex === 0}
                  className="flex items-center gap-2 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors px-4 py-2 hover:bg-white rounded-full"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span>{currentChapterIndex + 1} / {chapters.length}</span>
                <button 
                  onClick={() => setCurrentChapterIndex(prev => Math.min(chapters.length - 1, prev + 1))}
                  disabled={currentChapterIndex === chapters.length - 1}
                  className="flex items-center gap-2 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors px-4 py-2 hover:bg-white rounded-full"
                >
                  Next <ChevronRight size={16} />
                </button>
             </div>
           </div>
        </div>
      </div>

      {/* PDF Generation Overlay */}
      {/* Renders content in a fixed visible container so html2canvas can capture it properly on all devices */}
      {isExporting && (
        <div className="fixed inset-0 z-[100] bg-slate-100 overflow-y-auto">
           <div className="fixed top-0 left-0 w-full h-full flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-[101]">
              <div className="bg-white p-6 rounded-xl flex items-center gap-4 shadow-xl">
                 <Loader2 className="animate-spin text-blue-600" size={32} />
                 <div>
                    <h3 className="font-bold text-slate-900">Generating PDF...</h3>
                    <p className="text-slate-500 text-sm">Please wait while we format your book.</p>
                 </div>
              </div>
           </div>

           {/* The Actual Content to Print - Fixed to 816px (8.5in @ 96dpi) for strict layout control */}
           <div id="pdf-content-to-print" className="bg-white p-0 shadow-none mx-auto overflow-hidden" style={{ width: '816px', minHeight: '1056px' }}>
             {/* Title Page */}
             <div className="min-h-[1056px] flex flex-col items-center justify-center text-center px-16 pb-24 relative page-break-after-always">
                <h1 className="text-6xl font-serif font-bold mb-8 text-black leading-tight">{outline.title}</h1>
                <h2 className="text-xl font-sans text-gray-500 uppercase tracking-widest mb-16">A Lore Original</h2>
                
                {outline.coverImage && (
                   <div className="w-80 h-80 mb-12 border-4 border-gray-100 shadow-xl mx-auto">
                      <img src={`data:image/jpeg;base64,${outline.coverImage}`} className="w-full h-full object-cover" />
                   </div>
                )}
                
                <p className="text-xl italic max-w-2xl mx-auto leading-relaxed text-gray-600 font-serif">{outline.description}</p>
             </div>

             <div className="html2pdf__page-break"></div>

             {/* Chapters */}
             {chapters.map((chap, idx) => (
                <div key={chap.chapterNumber} className="py-12 px-12 min-h-[1056px]">
                   <div className="mb-8 text-center">
                      <span className="text-sm font-bold uppercase tracking-widest border-b border-black pb-2">Chapter {chap.chapterNumber}</span>
                      <h2 className="text-3xl font-serif font-bold mt-6 text-black">{chap.title}</h2>
                   </div>
                   <div className="prose font-serif max-w-none text-justify leading-loose text-black text-slate-900">
                      <ReactMarkdown>{chap.content}</ReactMarkdown>
                   </div>
                   {/* Add page break except for last chapter */}
                   {idx < chapters.length - 1 && <div className="html2pdf__page-break"></div>}
                </div>
             ))}
             
             {/* End Page */}
             <div className="min-h-[500px] flex flex-col items-center justify-center text-center html2pdf__page-break">
                <p className="text-sm text-gray-400 uppercase tracking-widest">The End</p>
                <div className="w-8 h-px bg-gray-200 my-4"></div>
                <p className="text-xs text-gray-300">Generated with Lore</p>
             </div>
           </div>
        </div>
      )}
    </>
  );
};
