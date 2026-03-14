import { useState, useRef, useCallback } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  delay?: number;
}

export function Tooltip({ content, children, position = 'bottom', delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-50 px-3 py-2 rounded-md bg-bg-primary border border-border shadow-lg text-[0.7rem] text-text-primary min-w-[200px] max-w-[320px] w-max leading-relaxed pointer-events-none ${
            position === 'top'
              ? 'bottom-full mb-1.5 right-0'
              : 'top-full mt-1.5 right-0'
          }`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
