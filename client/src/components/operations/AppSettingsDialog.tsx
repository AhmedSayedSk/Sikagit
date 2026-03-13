import { useState } from 'react';
import { X, Settings, Minus, Plus, Type, Code2, Palette, RotateCcw } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../lib/utils';

interface AppSettingsDialogProps {
  onClose: () => void;
}

type Tab = 'general' | 'editor' | 'appearance';

const tabs: { id: Tab; label: string; icon: typeof Type }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'editor', label: 'Diff / Editor', icon: Code2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

function SizeControl({ label, value, onChange, min, max, description }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-text-primary">{label}</span>
          {description && <p className="text-[0.6rem] text-text-muted mt-0.5">{description}</p>}
        </div>
        <span className="text-sm font-mono font-medium text-accent">{value}px</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="p-1 rounded border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-accent/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus size={12} />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-accent h-1"
        />
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="p-1 rounded border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-accent/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

export function AppSettingsDialog({ onClose }: AppSettingsDialogProps) {
  const {
    fontSize, setFontSize,
    diffFontSize, setDiffFontSize,
    diffLineHeight, setDiffLineHeight,
    theme, setTheme,
  } = useUIStore();

  const [activeTab, setActiveTab] = useState<Tab>('general');

  // Draft state
  const [draftFontSize, setDraftFontSize] = useState(fontSize);
  const [draftDiffFontSize, setDraftDiffFontSize] = useState(diffFontSize);
  const [draftDiffLineHeight, setDraftDiffLineHeight] = useState(diffLineHeight);
  const [draftTheme, setDraftTheme] = useState(theme);

  const hasChanges =
    draftFontSize !== fontSize ||
    draftDiffFontSize !== diffFontSize ||
    draftDiffLineHeight !== diffLineHeight ||
    draftTheme !== theme;

  const handleSave = () => {
    setFontSize(draftFontSize);
    setDiffFontSize(draftDiffFontSize);
    setDiffLineHeight(draftDiffLineHeight);
    setTheme(draftTheme);
    onClose();
  };

  const handleReset = () => {
    setDraftFontSize(14);
    setDraftDiffFontSize(12);
    setDraftDiffLineHeight(3);
    setDraftTheme('dark');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[680px] h-[600px] shadow-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-accent" />
            <span className="text-sm font-medium">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs + Content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Tab sidebar */}
          <div className="w-36 flex-shrink-0 border-r border-border bg-bg-primary/50 py-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                    activeTab === tab.id
                      ? 'bg-accent/10 text-accent border-r-2 border-accent font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/30'
                  )}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-medium text-text-primary mb-1">Interface Font Size</h3>
                  <p className="text-[0.6rem] text-text-muted mb-3">Controls the base font size across the entire application</p>
                  <SizeControl
                    label="Font Size"
                    value={draftFontSize}
                    onChange={setDraftFontSize}
                    min={10}
                    max={20}
                  />
                </div>

                {/* Preview */}
                <div className="border border-border rounded-lg p-3 bg-bg-primary">
                  <p className="text-[0.6rem] text-text-muted mb-2 font-medium uppercase tracking-wider">Preview</p>
                  <p style={{ fontSize: draftFontSize }} className="text-text-primary">
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <p style={{ fontSize: draftFontSize * 0.85 }} className="text-text-secondary mt-1">
                    Secondary text at {Math.round(draftFontSize * 0.85)}px
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-medium text-text-primary mb-1">Diff View</h3>
                  <p className="text-[0.6rem] text-text-muted mb-3">Configure how code changes are displayed</p>
                </div>

                <SizeControl
                  label="Font Size"
                  description="Size of code text in the diff viewer"
                  value={draftDiffFontSize}
                  onChange={setDraftDiffFontSize}
                  min={8}
                  max={20}
                />

                <SizeControl
                  label="Line Spacing"
                  description="Extra pixels added to each line height"
                  value={draftDiffLineHeight}
                  onChange={setDraftDiffLineHeight}
                  min={0}
                  max={10}
                />

                {/* Diff preview */}
                <div className="border border-border rounded-lg overflow-hidden bg-bg-primary">
                  <p className="text-[0.6rem] text-text-muted px-3 pt-2 pb-1 font-medium uppercase tracking-wider">Preview</p>
                  <div className="font-mono tracking-tight" style={{ fontSize: draftDiffFontSize, lineHeight: `${draftDiffFontSize + draftDiffLineHeight}px` }}>
                    <div className="px-3 py-px text-text-secondary"> const app = express();</div>
                    <div className="px-3 py-px bg-[var(--color-diff-remove-bg)] text-text-primary">-app.use(express.json());</div>
                    <div className="px-3 py-px bg-[var(--color-diff-add-bg)] text-text-primary">+app.use(express.json({'{'} limit: '5mb' {'}'}))</div>
                    <div className="px-3 py-px text-text-secondary"> app.listen(3000);</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-medium text-text-primary mb-1">Theme</h3>
                  <p className="text-[0.6rem] text-text-muted mb-3">Choose the color scheme for the interface</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDraftTheme('dark')}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors',
                      draftTheme === 'dark'
                        ? 'bg-accent/10 border-accent'
                        : 'bg-bg-primary border-border hover:border-border/80'
                    )}
                  >
                    <div className="w-full h-12 rounded bg-[#1e2036] border border-[#3e4070] flex items-center justify-center">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-[#7ba4f7]" />
                        <div className="w-2 h-2 rounded-full bg-[#6bcf7f]" />
                        <div className="w-2 h-2 rounded-full bg-[#d4a84a]" />
                      </div>
                    </div>
                    <span className={cn('text-xs font-medium', draftTheme === 'dark' ? 'text-accent' : 'text-text-secondary')}>
                      Dark
                    </span>
                  </button>
                  <button
                    onClick={() => setDraftTheme('light')}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors',
                      draftTheme === 'light'
                        ? 'bg-accent/10 border-accent'
                        : 'bg-bg-primary border-border hover:border-border/80'
                    )}
                  >
                    <div className="w-full h-12 rounded bg-gray-100 border border-gray-300 flex items-center justify-center">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      </div>
                    </div>
                    <span className={cn('text-xs font-medium', draftTheme === 'light' ? 'text-accent' : 'text-text-secondary')}>
                      Light
                    </span>
                  </button>
                </div>
                <p className="text-[0.6rem] text-text-muted">Light theme coming soon</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RotateCcw size={11} />
            Reset defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="px-4 py-1.5 rounded text-xs font-medium bg-accent-emphasis hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
