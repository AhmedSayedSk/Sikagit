import { useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { MainContent } from './MainContent';
import { ResizeHandle } from '../ui/ResizeHandle';
import { useUIStore } from '../../store/uiStore';
import { useUrlSelection } from '../../lib/urlSelection';
import { installOpenRepoRefreshListeners } from '../../lib/repoRefresh';
import { cn } from '../../lib/utils';

export function AppShell() {
  const { sidebarOpen, sidebarWidth, setSidebarWidth, fontSize, demoMode } = useUIStore();

  // Fetches repos + projects and keeps the open project/repo in sync with the URL.
  useUrlSelection();

  // Reload the open repo's commits/branches/status when the tab becomes visible
  // or the window regains focus (rate-limited per repo inside).
  useEffect(() => installOpenRepoRefreshListeners(), []);

  // Apply font size to <html> root so all rem-based sizes scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth(sidebarWidth + delta);
  }, [sidebarWidth, setSidebarWidth]);

  return (
    <div className={cn('flex flex-col h-screen overflow-hidden', demoMode && 'demo-mode')}>
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
