interface StreamViewerProps {
  body: string | object | null | undefined;
  isStreaming: boolean;
}

function parseSseTokens(raw: string): string[] {
  const tokens: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const json = line.slice(5).trim();
    if (json === '[DONE]') continue;
    try {
      const obj = JSON.parse(json);
      const content =
        obj?.choices?.[0]?.delta?.content ??
        obj?.choices?.[0]?.text ??
        null;
      if (typeof content === 'string') tokens.push(content);
    } catch {
      if (json) tokens.push(json);
    }
  }
  return tokens;
}

// Convert body to displayable string
function bodyToString(body: string | object | null | undefined): string {
  if (!body) return '';
  if (typeof body === 'string') {
    try { 
      return JSON.stringify(JSON.parse(body), null, 2); 
    } catch { 
      return body; 
    }
  }
  // It's an object
  return JSON.stringify(body, null, 2);
}

export function StreamViewer({ body, isStreaming }: StreamViewerProps) {
  if (!isStreaming) {
    const display = bodyToString(body);

    return (
      <pre className="font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed">
        {display || <span className="text-slate-400 italic">empty body</span>}
      </pre>
    );
  }

  // For streaming, convert to string if it's an object
  const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');
  const tokens    = parseSseTokens(bodyStr);
  const assembled = tokens.join('');

  return (
    <div className="flex flex-col gap-4">
      {/* Assembled text */}
      {assembled && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Assembled output
          </p>
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <p className="font-mono text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed">
              {assembled}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
