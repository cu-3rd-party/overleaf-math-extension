from __future__ import annotations

import re
from typing import List, Tuple

import sympy as sp


# ----------------------------
# Parsing: LaTeX -> SymPy Matrix
# ----------------------------

_ENV_RE = re.compile(
    r"\\begin\{(?P<env>pmatrix|bmatrix|matrix|vmatrix|array)\}(?P<body>.*?)\\end\{(?P=env)\}",
    re.DOTALL,
)

_ARRAY_COLSPEC_RE = re.compile(r"^\s*\{[^}]*\}", re.DOTALL)
_FRAC_RE = re.compile(r"\\frac\s*\{(?P<num>.*?)\}\s*\{(?P<den>.*?)\}", re.DOTALL)


def _strip_outer_math(s: str) -> str:
    s = s.strip()
    if s.startswith("$$") and s.endswith("$$"):
        return s[2:-2].strip()
    if s.startswith("$") and s.endswith("$"):
        return s[1:-1].strip()
    return s


def _split_rows(body: str) -> List[str]:
    body = body.strip().replace(r"\cr", r"\\")
    rows = re.split(r"(?<!\\)\\\\", body)
    return [r.strip() for r in rows if r.strip()]


def _split_cols(row: str) -> List[str]:
    return [c.strip() for c in row.split("&")]


def _latex_atom_to_sympy(expr_latex: str) -> sp.Expr:
    """
    Minimal element parser for matrix entries.
    Supports: numbers/symbols, + - * /, parentheses, x^2, \\frac{a}{b}
    """
    s = expr_latex.strip()

    # spacing commands
    s = re.sub(r"\\(,|;|quad|qquad|!|thinspace|medspace|thickspace)\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    # operators / constants
    s = s.replace(r"\cdot", "*").replace(r"\times", "*").replace(r"\div", "/")
    s = s.replace(r"\pi", "pi")
    s = s.replace(r"\left", "").replace(r"\right", "")

    # fractions (iterative for nesting)
    while True:
        m = _FRAC_RE.search(s)
        if not m:
            break
        num = m.group("num")
        den = m.group("den")
        s = s[: m.start()] + f"(({_latex_atom_to_sympy(num)})/({_latex_atom_to_sympy(den)}))" + s[m.end() :]

    # powers: ^{...} and ^token
    s = re.sub(r"\^\{([^}]*)\}", r"**(\1)", s)
    s = re.sub(r"\^([A-Za-z0-9]+)", r"**(\1)", s)

    # turn \alpha -> alpha (best-effort)
    s = re.sub(r"\\([A-Za-z]+)\b", r"\1", s)

    # minimal implicit multiplication: 2x -> 2*x, x2 -> x*2
    s = re.sub(r"(\d)([A-Za-z(])", r"\1*\2", s)
    s = re.sub(r"([A-Za-z\)])(\d)", r"\1*\2", s)

    try:
        return sp.sympify(s)
    except Exception as e:
        raise ValueError(f"Cannot parse element '{expr_latex}' -> '{s}': {e}") from e


def parse_single_latex_matrix(latex: str) -> Tuple[sp.Matrix, str]:
    """
    Parse ONE matrix from latex string. Returns (Matrix, env).
    """
    latex = _strip_outer_math(latex)
    m = _ENV_RE.search(latex)
    if not m:
        raise ValueError("Expected a LaTeX matrix environment like \\begin{pmatrix}...\\end{pmatrix}")

    env = m.group("env")
    body = m.group("body").strip()

    if env == "array":
        body = _ARRAY_COLSPEC_RE.sub("", body, count=1).strip()

    rows_raw = _split_rows(body)
    grid = []
    for r in rows_raw:
        cols_raw = _split_cols(r)
        grid.append([_latex_atom_to_sympy(c) for c in cols_raw])

    ncols = {len(r) for r in grid}
    if len(ncols) != 1:
        raise ValueError(f"Non-rectangular matrix: row lengths = {sorted(ncols)}")

    return sp.Matrix(grid), env


def parse_two_latex_matrices(latex: str) -> Tuple[Tuple[sp.Matrix, str], Tuple[sp.Matrix, str]]:
    """
    Extract EXACTLY TWO matrices from a single latex string like:

      \\begin{pmatrix}...\\end{pmatrix}
      \\begin{pmatrix}...\\end{pmatrix}

    Returns ((A, envA), (B, envB)).
    """
    latex = _strip_outer_math(latex)
    matches = list(_ENV_RE.finditer(latex))
    if len(matches) != 2:
        raise ValueError(f"Expected exactly 2 matrices in the input, found {len(matches)}")

    A_str = matches[0].group(0)
    B_str = matches[1].group(0)

    A, envA = parse_single_latex_matrix(A_str)
    B, envB = parse_single_latex_matrix(B_str)
    return (A, envA), (B, envB)


# ----------------------------
# Printing: SymPy Matrix -> LaTeX
# ----------------------------

def matrix_to_latex(M: sp.Matrix, env: str = "pmatrix") -> str:
    begin = rf"\begin{{{env}}}"
    end = rf"\end{{{env}}}"
    rows = []
    for i in range(M.rows):
        rows.append(" & ".join(sp.latex(M[i, j]) for j in range(M.cols)))
    return f"{begin}{r' \\ '.join(rows)}{end}"


# ----------------------------
# Operations (separate functions)
# ----------------------------

def latex_matmul(two_matrices_latex: str, *, out_env: str | None = None) -> str:
    """
    Input: a single string containing TWO LaTeX matrices back-to-back.
    Output: LaTeX matrix of their product.
    """
    (A, envA), (B, envB) = parse_two_latex_matrices(two_matrices_latex)
    C = A * B
    env = out_env or envA or envB or "pmatrix"
    return matrix_to_latex(C, env=env)


def latex_det(matrix_latex: str) -> str:
    """
    Input: LaTeX matrix string (one matrix).
    Output: LaTeX expression of determinant.
    """
    A, _env = parse_single_latex_matrix(matrix_latex)
    return sp.latex(A.det())


def latex_rref(matrix_latex: str, *, out_env: str | None = None) -> str:
    """
    ФСР (RREF).
    Input: one LaTeX matrix.
    Output: LaTeX matrix of RREF.
    """
    A, envA = parse_single_latex_matrix(matrix_latex)
    R, _pivots = A.rref()
    env = out_env or envA or "pmatrix"
    return matrix_to_latex(R, env=env)


def latex_gauss_echelon(matrix_latex: str, *, out_env: str | None = None) -> str:
    """
    Гаусс: ступенчатая форма (row echelon form).
    Input: one LaTeX matrix.
    Output: LaTeX matrix of echelon form.
    """
    A, envA = parse_single_latex_matrix(matrix_latex)
    E = A.echelon_form()
    env = out_env or envA or "pmatrix"
    return matrix_to_latex(E, env=env)


# ----------------------------
# Quick demo
# ----------------------------
if __name__ == "__main__":
    s = r"""
\begin{pmatrix}
1 & 2 \\
3 & 4
\end{pmatrix}
\begin{pmatrix}
5 & 6 \\
7 & 8
\end{pmatrix}
""".strip()

    print(latex_matmul(s))