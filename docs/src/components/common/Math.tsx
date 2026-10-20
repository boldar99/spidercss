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

/**
 * Produces balanced, beautiful KaTeX for |\overline{0}\rangle and |\overline{+}\rangle
 * so that both states have identical height, depth, overline position, and breathing room inside |...⟩,
 * without colliding with | or \rangle and without shrinking the + sign.
 */
export function logicalStateTex(basis: 'Z' | 'X', k = 1): string {
  const inner =
    basis === 'Z' ? '\\overline{\\vphantom{+}0}' : '\\overline{\\vphantom{0}+}';
  const ket = `|\\mkern2mu${inner}\\mkern2mu\\rangle`;
  return k > 1 ? `${ket}^{\\otimes ${k}}` : ket;
}

interface LogicalKetProps {
  basis: 'Z' | 'X';
  k?: number;
  className?: string;
}

export const LogicalKet: React.FC<LogicalKetProps> = ({
  basis,
  k = 1,
  className = '',
}) => (
  <Math
    tex={logicalStateTex(basis, k)}
    className={`inline-flex items-center leading-none ${className}`}
  />
);

