import { useCallback, useEffect, useRef } from 'react';

interface ColumnResizeHandleProps {
  onResize: (delta: number) => void;
}

export function ColumnResizeHandle({ onResize }: ColumnResizeHandleProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="flex-shrink-0 w-px bg-border/50 hover:bg-accent/50 active:bg-accent cursor-col-resize self-stretch relative transition-colors"
    >
      {/* Wider invisible hit area */}
      <div className="absolute top-0 bottom-0 -left-1 -right-1" />
    </div>
  );
}
