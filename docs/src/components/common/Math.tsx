import React, { useMemo } from 'react';
import katex from 'katex';

interface MathProps {
  tex: string;
  display?: boolean;
  className?: string;
}

export const Math: React.FC<MathProps> = ({
  tex,
  display = false,
  className = '',
}) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return tex;
    }
  }, [tex, display]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
