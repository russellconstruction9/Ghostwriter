
import React from 'react';
import { BookProject } from '../types';
import { Plus, Clock, Trash2, Download, BookCopy, Layers, Feather, Loader2, LogOut } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface DashboardProps {
  projects: BookProject[];
  onCreateProject: () => void;
  onSelectProject: (project: BookProject) => void;
  onDeleteProject: (id: string, e: React.MouseEvent) => void;
  onCreateSequel?: (project: BookProject) => void;
  generatingProjectId?: string | null;
  user: User;
  onSignOut: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  projects,
  onCreateProject,
  onSelectProject,
  onDeleteProject,
  onCreateSequel,
  generatingProjectId,
  user,
  onSignOut
}) => {

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleBackup = (e: React.MouseEvent, project: BookProject) => {
    e.stopPropagation();
    const element = document.createElement("a");
    const file = new Blob([JSON.stringify(project, null, 2)], {type: 'application/json'});
    element.href = URL.createObjectURL(file);
    element.download = `backup_${project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="bg-blue-950 border-b border-blue-900 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-6 md:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-white/10 text-blue-100 p-2 rounded-lg backdrop-blur-sm border border-white/10">
               <Feather size={20} strokeWidth={2} />
             </div>
             <div>
                <h1 className="font-serif text-2xl font-bold tracking-tight">Lore</h1>
                <p className="text-[11px] text-blue-200 font-medium opacity-80 tracking-wide">An R² Technologies Project.</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end mr-2">
              <p className="text-xs text-blue-200 font-medium">{user.email}</p>
            </div>
            <button
              onClick={onCreateProject}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-600/20 hover:-translate-y-0.5"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">New Manuscript</span>
            </button>
            <button
              onClick={onSignOut}
              className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-lg transition-all border border-white/10"
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Projects List */}
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-2xl font-serif font-bold text-slate-900">My Library</h2>
          <div className="text-sm text-slate-500 font-medium">
            {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
          </div>
        </div>
        
        {projects.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-xl border-2 border-dashed border-slate-200 shadow-sm">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
              <Feather size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No manuscripts yet</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-8 font-light leading-relaxed">
              Begin your journey by creating a new project. Transform your spoken stories into a written masterpiece.
            </p>
            <button 
              onClick={onCreateProject}
              className="text-blue-600 font-semibold border-b-2 border-blue-100 hover:border-blue-600 pb-0.5 transition-all"
            >
              Start Writing &rarr;
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => {
              const isGenerating = generatingProjectId === project.id;
              
              return (
              <div 
                key={project.id}
                onClick={() => onSelectProject(project)}
                className={`group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:border-blue-200 transition-all cursor-pointer flex flex-col h-72 relative overflow-hidden ${isGenerating ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
              >
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 to-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="p-8 flex-1 flex flex-col relative">
                   {/* Decorative background letter */}
                   <span className="font-serif text-8xl text-slate-50 font-bold absolute -bottom-4 -right-4 select-none group-hover:text-blue-50 transition-colors duration-300">
                      {project.title.charAt(0).toUpperCase()}
                   </span>

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-xs text-blue-600 font-bold uppercase tracking-wider">
                        <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-blue-500 animate-pulse' : 'bg-blue-500'}`}></div>
                        {isGenerating ? 'Writing Now...' : project.outline ? 'In Progress' : 'Drafting'}
                      </div>
                      {project.seriesId && (
                         <div className="flex items-center gap-1 text-[10px] text-purple-600 font-bold uppercase tracking-wider bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                            <Layers size={10} />
                            {project.seriesIndex ? `Vol. ${project.seriesIndex}` : 'Series'}
                         </div>
                      )}
                    </div>
                    <h3 className="font-serif font-bold text-xl text-slate-900 mb-3 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors">
                      {project.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                      {isGenerating ? (
                        <div className="text-blue-600 flex items-center gap-1">
                           <Loader2 size={12} className="animate-spin" /> Auto-Saving...
                        </div>
                      ) : (
                        <>
                          <Clock size={12} />
                          Edited {formatDate(project.lastModified)}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex items-center justify-between backdrop-blur-sm">
                   <div className="flex gap-2">
                      <span className="text-xs font-semibold px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-600 shadow-sm group-hover:border-blue-200 group-hover:text-blue-700 transition-colors">
                        {project.outline ? `${project.outline.chapters.length} Chapters` : 'Source Gathering'}
                      </span>
                   </div>
                   
                   <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-1 group-hover:translate-y-0 duration-200">
                      {onCreateSequel && project.outline && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onCreateSequel(project); }}
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                          title="Create Sequel / Next in Series"
                        >
                          <BookCopy size={16} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => handleBackup(e, project)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Backup"
                      >
                        <Download size={16} />
                      </button>
                      <button 
                        onClick={(e) => onDeleteProject(project.id, e)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                   </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  );
};
