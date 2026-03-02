"""Pyodide-compatible wrapper around lmat_cas_client's LaTeX -> SymPy -> simplify -> LaTeX pipeline.

Call init() once after mounting /app in Pyodide's FS, then call evaluate() freely.
No Obsidian / TS dependencies.
"""

from __future__ import annotations

# Lazy singletons, populated by init()
_compiler = None
_printer = None
_store = None
_initialized = False


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

    # 3. For relational expressions like a = b, evaluate only the RHS
    try:
        from sympy import Relational
        if isinstance(expr, Relational):
            expr = expr.rhs
    except Exception:
        pass

    # 4. Simplify
    try:
        result = sympy.simplify(expr.doit())
    except Exception as exc:
        raise ValueError(f"Evaluation error: {exc}") from exc

    # 5. Convert back to LaTeX
    return _printer.doprint(result)
