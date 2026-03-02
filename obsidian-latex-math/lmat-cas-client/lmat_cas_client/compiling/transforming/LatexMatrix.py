from sympy import Matrix
from sympy.core.sympify import converter


class LatexRaw:
    """
    Wraps a pre-rendered LaTeX string as an opaque value.

    Returned by operations (e.g. gauss with steps) that produce a full LaTeX
    sequence rather than a single SymPy expression.  The evaluate_wrapper
    detects this type and returns its string directly, bypassing simplify().
    """

    def __init__(self, latex_str: str):
        self._latex_str = latex_str

    def __str__(self) -> str:
        return self._latex_str

    def __repr__(self) -> str:
        return f"LatexRaw({self._latex_str!r})"


class LatexMatrix(Matrix):
    """
    The LatexMatrix class stores additional info about the eventual latex representation of a sympy matrix.
    """

    env_begin: str = None
    env_end: str = None

    def __new__(cls, *args, env_begin: str = None, env_end: str = None, **kwargs):
        # only the class type is propagated during matrix computations,
        # so a custom class is created for each new instance, which stores the latex strings.
        lmat_cls = type(
            f"LatexMatrix {env_begin} {env_end}",
            (cls,),
            {"env_begin": env_begin, "env_end": env_end, "__new__": super().__new__},
        )

        return lmat_cls(*args, **kwargs)


converter[LatexMatrix] = lambda x: type(x)(x)
