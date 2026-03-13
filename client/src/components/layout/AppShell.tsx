import { useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { MainContent } from './MainContent';
import { ResizeHandle } from '../ui/ResizeHandle';
import { useRepoStore } from '../../store/repoStore';
import { useUIStore } from '../../store/uiStore';

export function AppShell() {
  const { sidebarOpen, sidebarWidth, setSidebarWidth, fontSize } = useUIStore();
  const fetchRepos = useRepoStore(s => s.fetchRepos);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  // Apply font size to <html> root so all rem-based sizes scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth(sidebarWidth + delta);
  }, [sidebarWidth, setSidebarWidth]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth }} className="flex-shrink-0">
              <Sidebar />
            </div>
            <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
          </>
        )}
        <MainContent />
      </div>
      <StatusBar />
    </div>
  );
}
