import { Image as ImageIcon } from 'lucide-react';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']);

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.has(ext);
}

function buildFileUrl(repoPath: string, filePath: string, commit?: string): string {
  const params = new URLSearchParams({ repo: repoPath, file: filePath });
  if (commit) params.set('commit', commit);
  return `/api/v1/git/file?${params}`;
}

interface ImagePreviewProps {
  repoPath: string;
  filePath: string;
  commit?: string;
  parentCommit?: string;
}

export function ImagePreview({ repoPath, filePath, commit, parentCommit }: ImagePreviewProps) {
  const currentUrl = buildFileUrl(repoPath, filePath, commit);
  const previousUrl = parentCommit ? buildFileUrl(repoPath, filePath, parentCommit) : null;

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full overflow-auto">
      {parentCommit ? (
        // Commit diff: show before/after
        <div className="flex gap-8 items-start flex-wrap justify-center">
          {previousUrl && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-medium text-danger">Before</span>
              <div className="border border-border rounded-lg p-3 bg-bg-secondary">
                <img
                  src={previousUrl}
                  alt="Previous version"
                  className="max-w-[360px] max-h-[360px] object-contain rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-medium text-success">After</span>
            <div className="border border-border rounded-lg p-3 bg-bg-secondary">
              <img
                src={currentUrl}
                alt="Current version"
                className="max-w-[360px] max-h-[360px] object-contain rounded"
              />
            </div>
          </div>
        </div>
      ) : (
        // Working tree: show current image
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-text-secondary">
            <ImageIcon size={14} />
            <span className="text-xs">Image Preview</span>
          </div>
          <div className="border border-border rounded-lg p-3 bg-bg-secondary">
            <img
              src={currentUrl}
              alt={filePath}
              className="max-w-[480px] max-h-[480px] object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
