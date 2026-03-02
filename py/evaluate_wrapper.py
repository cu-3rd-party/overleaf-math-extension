"""
Pyodide-compatible wrapper around lmat_cas_client's LaTeX -> SymPy -> simplify -> LaTeX pipeline.

Call init() once after mounting /app in Pyodide's FS, then call evaluate() freely.
No Obsidian / TS dependencies.
"""

from __future__ import annotations
import re as _re

# Lazy singletons, populated by init()
_compiler = None
_printer = None
_store = None
_initialized = False

# Regex that captures the first matrix environment name in a LaTeX string
# e.g. \begin{pmatrix}, \begin{bmatrix}, \begin{vmatrix} ...
_MATRIX_ENV_RE = _re.compile(r"\\begin\{([a-zA-Z]*matrix|array)\}")


def _find_matrix_env(latex: str) -> tuple[str, str] | None:
    """Return (env_begin, env_end) of the first matrix environment in *latex*, or None."""
    m = _MATRIX_ENV_RE.search(latex)
    if not m:
        return None
    env = m.group(1)
    return rf"\begin{{{env}}}", rf"\end{{{env}}}"


def init() -> None:
    """Initialise the pipeline. Idempotent, safe to call multiple times."""
    global _compiler, _printer, _store, _initialized
    if _initialized:
        return

    from lmat_cas_client.math_lib.setup import setup_mathlib
    from lmat_cas_client.compiling.Compiler import LatexToSympyCompiler
    from lmat_cas_client.LmatLatexPrinter import LmatLatexPrinter
    from lmat_cas_client.math_lib.StandardDefinitionStore import StandardDefinitionStore

    setup_mathlib()  # must be called before any parsing
    _compiler = LatexToSympyCompiler()
    _printer = LmatLatexPrinter()
    _store = StandardDefinitionStore
    _initialized = True
    print("[evaluate_wrapper] init complete")


def evaluate(latex: str) -> str:
    """Compile latex, simplify the SymPy expression, return a LaTeX string.

    Raises RuntimeError if init() has not been called.
    Raises ValueError on parse or evaluation failures.
    """
    if not _initialized:
        raise RuntimeError("evaluate_wrapper.init() must be called before evaluate()")

    import sympy

    # 0. Remember the matrix env from the original LaTeX (to restore it after simplify)
    #    Priority: LatexMatrix on the compiled expr >  regex scan of the source string
    _env: tuple[str, str] | None = None
    try:
        env_from_latex = _find_matrix_env(latex)
    except Exception:
        env_from_latex = None
    _env = env_from_latex  # will be overridden if the compiled expr carries richer info

    # 1. Parse LaTeX -> SymPy
    try:
        expr = _compiler.compile(latex, _store)
    except Exception as exc:
        raise ValueError(f"Parse error: {exc}") from exc

    # 2. Unwrap SystemOfExpr (multi-line / alignment environment).
    # Take the last expression in the system.
    try:
        from lmat_cas_client.compiling.transforming.SystemOfExpr import SystemOfExpr

        if isinstance(expr, SystemOfExpr):
            items = list(expr)
            last = items[-1]
            # Items may be (Expr, meta) tuples
            expr = last[0] if isinstance(last, tuple) else last
    except Exception:
        pass  # if SystemOfExpr isn't importable, expr is already a plain Expr

    # Capture env from the compiled expression if it's a LatexMatrix (highest priority)
    try:
        from lmat_cas_client.compiling.transforming.LatexMatrix import LatexMatrix

        if isinstance(expr, LatexMatrix) and expr.env_begin and expr.env_end:
            _env = (expr.env_begin, expr.env_end)
    except Exception:
        pass

    # 3. For relational expressions like a = b, evaluate only the RHS
    try:
        from sympy import Relational

        if isinstance(expr, Relational):
            expr = expr.rhs
    except Exception:
        pass

    # 4. If the result is already a LatexRaw (e.g. gauss with steps),
    # skip simplify and return its string directly.
    try:
        from lmat_cas_client.compiling.transforming.LatexMatrix import LatexRaw

        if isinstance(expr, LatexRaw):
            return str(expr)
    except Exception:
        pass

    # 5. Simplify
    try:
        result = sympy.simplify(expr.doit())
    except Exception as exc:
        raise ValueError(f"Evaluation error: {exc}") from exc

    # 5a. If simplify dropped the LatexMatrix wrapper, restore the matrix environment
    #     so the printer renders it with the same \begin{pmatrix} the user typed.
    try:
        from sympy import MatrixBase
        from lmat_cas_client.compiling.transforming.LatexMatrix import LatexMatrix

        if (
            _env is not None
            and isinstance(result, MatrixBase)
            and not isinstance(result, LatexMatrix)
        ):
            env_begin, env_end = _env
            result = LatexMatrix(result.tolist(), env_begin=env_begin, env_end=env_end)
    except Exception:
        pass  # if re-wrapping fails, fall back to default printer output

    # 6. Convert back to LaTeX
    return _printer.doprint(result)
