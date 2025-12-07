
import React, { useState, useEffect, useRef } from 'react';
import { BookProject, AppView, Source, SourceType, WritingStyle, ChapterContent } from './types';
import { Dashboard } from './components/Dashboard';
import { ProjectEditor } from './components/ProjectEditor';
import { AuthPage } from './components/AuthPage';
import { writeChapter } from './services/gemini';
import { supabase } from './services/supabase';
import { User } from '@supabase/supabase-js';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [projects, setProjects] = useState<BookProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Background Generation State
  const [generatingProjectId, setGeneratingProjectId] = useState<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Check authentication state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load projects from localStorage on mount
  useEffect(() => {
    if (!user) return;

    try {
      const saved = localStorage.getItem(`storyforge_projects_${user.id}`);
      if (saved) {
        setProjects(JSON.parse(saved));
      }

      // Session Restoration
      const lastActiveId = localStorage.getItem(`storyforge_active_project_${user.id}`);
      if (lastActiveId && saved) {
        const parsedProjects = JSON.parse(saved) as BookProject[];
        if (parsedProjects.find(p => p.id === lastActiveId)) {
          setActiveProjectId(lastActiveId);
          setView(AppView.EDITOR);
          window.history.replaceState({ view: AppView.EDITOR, projectId: lastActiveId }, '');
        }
      }
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  }, [user]);

  // Save projects to localStorage whenever they change
  useEffect(() => {
    if (!user) return;

    try {
      localStorage.setItem(`storyforge_projects_${user.id}`, JSON.stringify(projects));

      if (activeProjectId) {
         localStorage.setItem(`storyforge_active_project_${user.id}`, activeProjectId);
      } else {
         localStorage.removeItem(`storyforge_active_project_${user.id}`);
      }
    } catch (e: any) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        alert("Storage Full! Your project is too large to save automatically. Please delete old projects or fewer images to prevent data loss.");
      } else {
        console.error("Failed to save project", e);
      }
    }
  }, [projects, activeProjectId, user]);

  // Handle Browser Back Button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view === AppView.EDITOR) {
        setActiveProjectId(event.state.projectId);
        setView(AppView.EDITOR);
      } else {
        setActiveProjectId(null);
        setView(AppView.DASHBOARD);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- Background Generator Logic ---

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.error(`Wake Lock failed: ${err}`);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.error(`Wake Lock release failed: ${err}`);
      }
    }
  };

  const startBookGeneration = async (projectId: string, style: WritingStyle) => {
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.outline) return;
    
    setGeneratingProjectId(projectId);
    await requestWakeLock();

    // Initialize chapters if empty
    let currentChapters = project.chapters.length > 0 ? project.chapters : project.outline.chapters.map(c => ({
      chapterNumber: c.chapterNumber,
      title: c.title,
      content: '',
      isGenerating: true
    }));

    // Update state to show loading spinners immediately
    handleUpdateProject({ ...project, chapters: currentChapters });

    let hasFatalError = false;

    // We use a functional update pattern in the loop to always get the LATEST project state
    // This allows the user to edit other parts of the project while generation runs.
    for (const chapOutline of project.outline.chapters) {
      // Check if this chapter is already done (e.g. resumption)
      const existingChap = currentChapters.find(c => c.chapterNumber === chapOutline.chapterNumber);
      if (existingChap && existingChap.content && !existingChap.isGenerating) {
        continue;
      }
      
      if (hasFatalError) break;

      try {
        // Fetch fresh project state to ensure we have latest sources/outline edits
        // Note: In a real app with complex state, we'd use a ref, but here we can trust the loop context 
        // IF we are careful not to overwrite the whole project object with stale data.
        
        const content = await writeChapter(chapOutline, project.outline, project.sources, style);
        
        // Success: Update the specific chapter
        setProjects(prevProjects => prevProjects.map(p => {
          if (p.id !== projectId) return p;
          
          const updatedChapters = p.chapters.map(c => 
            c.chapterNumber === chapOutline.chapterNumber 
              ? { ...c, content, isGenerating: false }
              : c
          );
          
          return { ...p, chapters: updatedChapters, lastModified: Date.now() };
        }));

        // Update local reference for the loop
        currentChapters = currentChapters.map(c => 
            c.chapterNumber === chapOutline.chapterNumber 
              ? { ...c, content, isGenerating: false }
              : c
        );

      } catch (e: any) {
         console.error(`Error generating chapter ${chapOutline.chapterNumber}`, e);
         const isFatal = e.message?.includes('leaked') || e.message?.includes('PERMISSION_DENIED') || e.status === 403;
         
         if (isFatal) {
             hasFatalError = true;
             alert(`Generation Stopped: ${e.message}`);
         }

         setProjects(prevProjects => prevProjects.map(p => {
            if (p.id !== projectId) return p;
            const updatedChapters = p.chapters.map(c => 
              c.chapterNumber === chapOutline.chapterNumber 
                ? { ...c, isGenerating: false, content: isFatal ? "Stopped due to API error." : "Generation failed. Please retry." }
                : c
            );
            return { ...p, chapters: updatedChapters };
         }));
      }
    }

    setGeneratingProjectId(null);
    await releaseWakeLock();
  };

  // --- End Generator Logic ---

  const handleCreateProject = () => {
    const newProject: BookProject = {
      id: crypto.randomUUID(),
      title: 'Untitled Manuscript',
      lastModified: Date.now(),
      sources: [],
      outline: null,
      chapters: [],
      currentStep: 0,
    };
    
    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setView(AppView.EDITOR);
    window.history.pushState({ view: AppView.EDITOR, projectId: newProject.id }, '');
  };

  const handleCreateSequel = (originalProject: BookProject) => {
     const seriesId = originalProject.seriesId || crypto.randomUUID();
     const nextIndex = (originalProject.seriesIndex || 1) + 1;

     if (!originalProject.seriesId) {
        const updatedOriginal = { ...originalProject, seriesId, seriesIndex: 1 };
        handleUpdateProject(updatedOriginal);
     }

     const contextContent = `PREVIOUS BOOK CONTEXT:
Title: ${originalProject.title}
Description: ${originalProject.outline?.description || 'No description available.'}

CHAPTER SUMMARIES:
${originalProject.outline?.chapters.map(c => `Chapter ${c.chapterNumber}: ${c.title}\n${c.summary}`).join('\n\n') || 'No chapters available.'}
`;

    const contextSource: Source = {
      id: crypto.randomUUID(),
      type: SourceType.TEXT,
      name: `Context: ${originalProject.title}`,
      content: contextContent,
      isProcessing: false
    };

    const newProject: BookProject = {
      id: crypto.randomUUID(),
      title: `Sequel to ${originalProject.title}`,
      lastModified: Date.now(),
      sources: [contextSource],
      outline: null,
      chapters: [],
      currentStep: 0,
      seriesId: seriesId,
      seriesIndex: nextIndex
    };

    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setView(AppView.EDITOR);
    window.history.pushState({ view: AppView.EDITOR, projectId: newProject.id }, '');
  };

  const handleUpdateProject = (updatedProject: BookProject) => {
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setView(AppView.DASHBOARD);
        window.history.replaceState({ view: AppView.DASHBOARD }, '');
      }
    }
  };

  const handleSelectProject = (project: BookProject) => {
    setActiveProjectId(project.id);
    setView(AppView.EDITOR);
    window.history.pushState({ view: AppView.EDITOR, projectId: project.id }, '');
  };

  const handleBackToDashboard = () => {
    setActiveProjectId(null);
    setView(AppView.DASHBOARD);
    window.history.pushState({ view: AppView.DASHBOARD }, '');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthSuccess={() => setAuthLoading(false)} />;
  }

  const activeProject = projects.find(p => p.id === activeProjectId);

  if (view === AppView.EDITOR && activeProject) {
    return (
      <ProjectEditor
        project={activeProject}
        onUpdateProject={handleUpdateProject}
        onBack={handleBackToDashboard}
        onStartGeneration={(style) => startBookGeneration(activeProject.id, style)}
        isGeneratingGlobal={generatingProjectId === activeProject.id}
      />
    );
  }

  return (
    <Dashboard
      projects={projects}
      onCreateProject={handleCreateProject}
      onSelectProject={handleSelectProject}
      onDeleteProject={handleDeleteProject}
      onCreateSequel={handleCreateSequel}
      generatingProjectId={generatingProjectId}
      user={user}
      onSignOut={async () => {
        await supabase.auth.signOut();
        setProjects([]);
        setActiveProjectId(null);
      }}
    />
  );
};

export default App;
