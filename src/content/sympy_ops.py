import re
import sympy as sp

_ENV_RE = re.compile(
    r'\\begin\{([a-z]*matrix\*?)\}(.*?)\\end\{\1\}',
    re.DOTALL,
)

def _parse_matrix(body: str) -> sp.Matrix:
    rows_raw = re.split(r'\\\\', body.strip())
    grid = []
    for row in rows_raw:
        row = row.strip()
        if not row:
            continue
        cols = []
        for cell in row.split('&'):
            cell = cell.strip()
            # Replace \frac{a}{b} with (a)/(b) for sympify
            cell = re.sub(
                r'\\frac\{([^}]*)\}\{([^}]*)\}',
                r'((\1)/(\2))',
                cell,
            )
            # Remove remaining LaTeX commands (best-effort)
            cell = re.sub(r'\\[a-zA-Z]+', '', cell).strip()
            # Implicit multiplication: 2x -> 2*x
            cell = re.sub(r'(\d)([A-Za-z])', r'\1*\2', cell)
            try:
                cols.append(sp.sympify(cell))
            except Exception:
                cols.append(sp.Integer(0))
        grid.append(cols)
    return sp.Matrix(grid)


def detect_matrices(text: str) -> int:
    """Return the number of matrix environments found in text."""
    return len(_ENV_RE.findall(text))


def evaluate_multiply(text: str) -> str:
    """
    Expects exactly 2 matrix environments in text.
    Returns LaTeX string for their product, prefixed with ' = '.
    """
    matches = list(_ENV_RE.finditer(text))
    if len(matches) < 2:
        raise ValueError(f"Need 2 matrices, found {len(matches)}")
    A = _parse_matrix(matches[0].group(2))
    B = _parse_matrix(matches[1].group(2))
    C = A * B
    return ' = ' + sp.latex(C)
