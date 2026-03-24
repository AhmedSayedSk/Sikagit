const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_DIFF_LENGTH = 30000;

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_LENGTH) return diff;
  return diff.substring(0, MAX_DIFF_LENGTH) + '\n\n... [diff truncated due to size]';
}

function normalizeFilePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export async function suggestCommitMessage(
  apiKey: string,
  model: string,
  diff: string
): Promise<{ title: string; description: string }> {
  const prompt = `You are a Git commit message expert. Analyze this diff and suggest a commit message.

Rules:
- Title: max 72 chars, imperative mood (e.g. "Add", "Fix", "Update", "Remove"), no period at end
- Description: 1-3 short sentences explaining what changed and why, can be empty if the title is self-explanatory
- Focus on the "what" and "why", not the "how"
- Use conventional commit style when appropriate (feat:, fix:, refactor:, docs:, style:, chore:)

Return JSON: { "title": "...", "description": "..." }

Diff:
${truncateDiff(diff)}`;

  const text = await callGemini(apiKey, model, prompt);
  try {
    const result = JSON.parse(text);
    return {
      title: result.title || '',
      description: result.description || '',
    };
  } catch {
    throw new Error('Failed to parse AI response');
  }
}

export interface CommitGroup {
  files: string[];
  title: string;
  description: string;
}

export async function suggestSmartCommitGroups(
  apiKey: string,
  model: string,
  diff: string,
  stagedFiles: string[]
): Promise<CommitGroup[]> {
  const prompt = `You are a Git expert. Analyze these staged changes and group related files into logical commits.

Rules:
- Group files that are part of the same feature, fix, or change together
- Each group should represent one logical unit of work
- IMPORTANT: You MUST use the EXACT file paths as listed below — do not modify, prefix, or alter them in any way
- Every file must appear in exactly one group
- Title: max 72 chars, imperative mood, conventional commit style (feat:, fix:, refactor:, etc.)
- Description: brief explanation of what the group of changes does
- If all files are related to one change, return a single group

Staged files (use these EXACT paths in your response):
${stagedFiles.join('\n')}

Diff:
${truncateDiff(diff)}

Return JSON: { "groups": [{ "files": ["exact/path/from/list"], "title": "...", "description": "..." }] }`;

  const text = await callGemini(apiKey, model, prompt);
  console.log('[SmartCommit] AI raw response:', text.substring(0, 500));

  try {
    const result = JSON.parse(text);
    let groups: CommitGroup[] = result.groups || [];
    console.log('[SmartCommit] Parsed groups:', groups.length, '| Staged files:', stagedFiles.length);

    // Build a normalization map: normalizedPath -> originalStagedPath
    const normalizedStaged = new Map(stagedFiles.map(f => [normalizeFilePath(f), f]));

    // Normalize AI-returned file paths to match staged files
    for (const group of groups) {
      group.files = group.files.map(f => {
        const normalized = normalizeFilePath(f);
        return normalizedStaged.get(normalized) || f;
      });
    }

    // Validate all files are accounted for
    const allGroupedFiles = new Set(groups.flatMap(g => g.files));
    const missingFiles: string[] = [];
    for (const file of stagedFiles) {
      if (!allGroupedFiles.has(file)) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      console.log('[SmartCommit] Files missing from AI groups:', missingFiles);
    }

    // If AI grouping completely failed (no files matched), generate a proper message
    if (missingFiles.length === stagedFiles.length) {
      console.log('[SmartCommit] All files unmatched — falling back to single commit message');
      const fallback = await suggestCommitMessage(apiKey, model, diff);
      return [{ files: stagedFiles, title: fallback.title, description: fallback.description }];
    }

    // Add missing files to last group
    if (missingFiles.length > 0 && groups.length > 0) {
      groups[groups.length - 1].files.push(...missingFiles);
    }

    // Remove files that don't exist in staged
    const stagedSet = new Set(stagedFiles);
    for (const group of groups) {
      group.files = group.files.filter(f => stagedSet.has(f));
    }

    // Remove empty groups
    return groups.filter(g => g.files.length > 0);
  } catch (err) {
    console.error('[SmartCommit] Failed to parse AI response:', err);
    // Fallback: generate a single commit message instead of failing
    const fallback = await suggestCommitMessage(apiKey, model, diff);
    return [{ files: stagedFiles, title: fallback.title, description: fallback.description }];
  }
}
