

import React, { useState } from 'react';
import { BookOutline, ChapterOutline } from '../types';
import { Sparkles, RefreshCw, Pencil, Check, X, Image as ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react';

interface OutlineBuilderProps {
  outline: BookOutline;
  isGenerating: boolean;
  onRegenerate: () => void;
  onGenerateCover: () => void;
  onUpdateOutline: (outline: BookOutline) => void;
}

export const OutlineBuilder: React.FC<OutlineBuilderProps> = ({ 
  outline, 
  isGenerating, 
  onRegenerate,
  onGenerateCover,
  onUpdateOutline
}) => {
  const [editingIndex, setEditingIndex] = useState<number | 'HEADER' | null>(null);
  const [editData, setEditData] = useState<{title: string, summary: string} | null>(null);

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center space-y-8">
        <LoaderSpinner />
        <div>
           <h3 className="text-2xl font-serif font-bold text-blue-950">Structuring Manuscript...</h3>
           <p className="text-slate-500 mt-2 max-w-md mx-auto font-medium">
             Analyzing themes, narrative arcs, and key events from your materials.
           </p>
        </div>
      </div>
    );
  }

  const startEditing = (index: number | 'HEADER', currentTitle: string, currentSummary: string) => {
    setEditingIndex(index);
    setEditData({ title: currentTitle, summary: currentSummary });
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditData(null);
  };

  const saveHeader = () => {
    if (!editData) return;
    onUpdateOutline({
      ...outline,
      title: editData.title,
      description: editData.summary
    });
    setEditingIndex(null);
  };

  const saveChapter = (index: number) => {
    if (!editData) return;
    const newChapters = [...outline.chapters];
    newChapters[index] = {
      ...newChapters[index],
      title: editData.title,
      summary: editData.summary
    };
    onUpdateOutline({
      ...outline,
      chapters: newChapters
    });
    setEditingIndex(null);
  };

  const addChapter = () => {
    const nextNum = outline.chapters.length + 1;
    const newChapter: ChapterOutline = {
      chapterNumber: nextNum,
      title: "New Chapter",
      summary: "Description of the new chapter..."
    };
    const newChapters = [...outline.chapters, newChapter];
    onUpdateOutline({ ...outline, chapters: newChapters });
    
    // Immediately start editing the new chapter
    startEditing(newChapters.length - 1, newChapter.title, newChapter.summary);
  };

  const deleteChapter = (index: number) => {
    if(!window.confirm("Delete this chapter?")) return;
    
    const newChapters = outline.chapters.filter((_, i) => i !== index);
    // Re-index chapter numbers
    const reindexed = newChapters.map((c, i) => ({ ...c, chapterNumber: i + 1 }));
    
    onUpdateOutline({ ...outline, chapters: reindexed });
  };

  return (
    <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="text-center border-b border-slate-200 pb-12 relative group">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-blue-600 rounded-full"></div>
        
        <div className="mt-8 mb-6 flex justify-center items-center gap-4">
           <span className="text-xs font-bold tracking-[0.2em] uppercase text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Outline Draft</span>
           <button 
             onClick={onGenerateCover}
             className="text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
             title="Generate Cover Art"
           >
             <ImageIcon size={14} />
             {outline.coverImage ? 'Regenerate Cover' : 'Create Cover Art'}
           </button>
        </div>

        {editingIndex === 'HEADER' && editData ? (
           <div className="max-w-2xl mx-auto text-left space-y-4 bg-slate-50 p-6 rounded-xl border border-blue-200 shadow-inner">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Book Title</label>
                <input 
                  value={editData.title}
                  onChange={(e) => setEditData({...editData, title: e.target.value})}
                  className="w-full text-3xl font-serif font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Synopsis</label>
                <textarea 
                  value={editData.summary}
                  onChange={(e) => setEditData({...editData, summary: e.target.value})}
                  rows={4}
                  className="w-full text-lg text-slate-700 bg-white border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-serif"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={cancelEditing} className="px-4 py-2 text-slate-600 font-bold text-sm hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                <button onClick={saveHeader} className="px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 transition-colors shadow-sm">Save Changes</button>
              </div>
           </div>
        ) : (
          <div className="relative">
             <h2 className="text-5xl md:text-6xl font-serif font-bold text-blue-950 mb-8 tracking-tight leading-tight px-4">{outline.title}</h2>
             <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed font-serif italic px-4">
               {outline.description}
             </p>
             <button 
               onClick={() => startEditing('HEADER', outline.title, outline.description)}
               className="absolute top-0 right-0 md:right-10 p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
               title="Edit Title & Synopsis"
             >
               <Pencil size={18} />
             </button>
          </div>
        )}

        {/* Cover Image Preview */}
        {outline.coverImage && (
          <div className="mt-8 max-w-xs mx-auto shadow-2xl rounded-lg overflow-hidden border-4 border-white rotate-1 hover:rotate-0 transition-transform duration-500">
            <img src={`data:image/jpeg;base64,${outline.coverImage}`} alt="Book Cover" className="w-full h-auto" />
          </div>
        )}
      </div>

      {/* Chapters */}
      <div className="space-y-8 px-6 md:px-0">
        <div className="flex justify-between items-end px-2 border-b border-slate-100 pb-4">
          <h3 className="font-sans text-sm font-bold text-slate-400 uppercase tracking-wider">Table of Contents</h3>
          <button 
            onClick={onRegenerate}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-md transition-all"
          >
            <RefreshCw size={12} />
            Regenerate Structure
          </button>
        </div>

        <div className="grid gap-10">
          {outline.chapters.map((chapter, idx) => (
            <div key={idx} className={`relative pl-10 md:pl-12 border-l-2 transition-colors py-2 group ${editingIndex === idx ? 'border-blue-500' : 'border-slate-100 hover:border-blue-300'}`}>
              <span className={`absolute -left-[13px] top-2 w-6 h-6 rounded-full border-2 text-xs font-bold flex items-center justify-center font-mono transition-all shadow-sm ${editingIndex === idx ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:border-blue-500 group-hover:bg-blue-600 group-hover:text-white'}`}>
                {chapter.chapterNumber}
              </span>
              
              {editingIndex === idx && editData ? (
                 <div className="space-y-4 bg-slate-50 p-6 rounded-xl border border-blue-200 shadow-lg -ml-4 mr-4 md:mr-0 animate-in fade-in zoom-in-95 duration-200">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Chapter Title</label>
                      <input 
                        value={editData.title}
                        onChange={(e) => setEditData({...editData, title: e.target.value})}
                        className="w-full text-xl font-serif font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Chapter Summary / Plot Points</label>
                      <textarea 
                        value={editData.summary}
                        onChange={(e) => setEditData({...editData, summary: e.target.value})}
                        rows={5}
                        className="w-full text-base text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-serif"
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <button onClick={cancelEditing} className="px-4 py-2 text-slate-600 font-bold text-xs hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1">
                        <X size={14} /> Cancel
                      </button>
                      <button onClick={() => saveChapter(idx)} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1">
                        <Check size={14} /> Save Changes
                      </button>
                    </div>
                 </div>
              ) : (
                <div className="relative pr-10">
                  <h4 className="text-2xl font-bold text-slate-800 font-serif mb-3 group-hover:text-blue-800 transition-colors">
                    {chapter.title}
                  </h4>
                  <p className="text-slate-600 leading-relaxed text-lg">
                    {chapter.summary}
                  </p>
                  
                  <div className="absolute top-0 right-0 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={() => startEditing(idx, chapter.title, chapter.summary)}
                        className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Edit Chapter"
                    >
                        <Pencil size={18} />
                    </button>
                    <button 
                        onClick={() => deleteChapter(idx)}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Chapter"
                    >
                        <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add Chapter Button */}
        <div className="pt-4 flex justify-center">
            <button 
                onClick={addChapter}
                className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold border-2 border-dashed border-slate-200 hover:border-blue-300 px-6 py-3 rounded-xl transition-all hover:bg-blue-50"
            >
                <Plus size={18} />
                Add Chapter
            </button>
        </div>
      </div>
    </div>
  );
};

const LoaderSpinner = () => (
  <div className="relative">
     <div className="w-16 h-16 border-4 border-blue-100 rounded-full"></div>
     <div className="w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent absolute top-0 left-0 animate-spin"></div>
  </div>
);