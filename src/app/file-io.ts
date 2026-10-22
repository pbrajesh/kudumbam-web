/** Minimal shape of the claude.ai artifact runtime, present only when the app runs as a hosted artifact. */
interface ClaudeRuntime {
  use(name: 'downloads'): Promise<{ save(r: { filename: string; data: string | Blob }): Promise<unknown> } | null>;
}

export type SaveOutcome = 'saved' | 'declined' | 'failed';

/**
 * Save text as a file. In a normal browser this is an ordinary download.
 * Inside a claude.ai artifact the host's downloads capability is used; it does not
 * accept the .ged extension, so the file is saved as .ged.txt there.
 */
export async function saveTextFile(filename: string, text: string): Promise<{ outcome: SaveOutcome; filename: string }> {
  const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (runtime?.use) {
    const downloads = await runtime.use('downloads').catch(() => null);
    if (downloads) {
      const name = filename.endsWith('.txt') ? filename : `${filename}.txt`;
      try {
        await downloads.save({ filename: name, data: text });
        return { outcome: 'saved', filename: name };
      } catch (e) {
        const code = (e as { code?: string })?.code;
        return { outcome: code === 'declined' ? 'declined' : 'failed', filename: name };
      }
    }
  }
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { outcome: 'saved', filename };
  } catch {
    return { outcome: 'failed', filename };
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}
