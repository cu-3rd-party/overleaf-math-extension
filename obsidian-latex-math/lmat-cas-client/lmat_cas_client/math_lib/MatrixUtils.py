from sympy import *


# Check if the given sympy object can be treated as a matrix.
def is_matrix(obj: Basic) -> bool:
    return hasattr(obj, "is_Matrix") and obj.is_Matrix


# If the given object is not a matrix, try to construct a 0d (1 by 1) Matrix containing the given value.
# If it is already a matrix, returns the matrix without modifying it in any way.
def ensure_matrix(obj: Basic) -> MatrixBase:
    if not is_matrix(obj):
        return Matrix([obj])
    return obj


def _elim_op_label(r: int, pivot_row: int, factor) -> str:
    """Format a row elimination annotation like (r) - 3·(p) or (r) + 2·(p)."""
    neg_factor = -factor
    pos = neg_factor.is_positive
    if pos is None:
        pos = False
    if pos:
        return rf"({r + 1}) + {latex(neg_factor)} \cdot ({pivot_row + 1})"
    else:
        return rf"({r + 1}) - {latex(factor)} \cdot ({pivot_row + 1})"


def gauss_with_steps(mat: MatrixBase):
    """
    Perform full Gauss-Jordan elimination on *mat*, recording every row operation.

    Returns a list of ``(op_latex, matrix)`` pairs where:
    - The first pair has ``op_latex = None`` and holds the *original* matrix.
    - Each subsequent pair has a LaTeX annotation for the row operation and
      the matrix state *after* that operation.

    The result is the reduced row echelon form (RREF).
    """
    M = [list(row) for row in mat.tolist()]
    n = len(M)
    m = len(M[0]) if n > 0 else 0

    def current_mat():
        return Matrix(M)

    steps = [(None, current_mat())]

    pivot_row = 0
    for col in range(m):
        if pivot_row >= n:
            break

        # Find first non-zero entry in this column at or below pivot_row
        found = -1
        for r in range(pivot_row, n):
            if M[r][col] != 0:
                found = r
                break

        if found == -1:
            continue  # whole column below is zero, skip

        # Row swap if needed
        if found != pivot_row:
            M[pivot_row], M[found] = M[found], M[pivot_row]
            op = rf"({pivot_row + 1}) \leftrightarrow ({found + 1})"
            steps.append((op, current_mat()))

        # Normalise pivot row so the pivot becomes 1
        pivot_val = simplify(M[pivot_row][col])
        if pivot_val != S.One:
            M[pivot_row] = [simplify(x / pivot_val) for x in M[pivot_row]]
            inv = simplify(S.One / pivot_val)
            op = rf"{latex(inv)} \cdot ({pivot_row + 1})"
            steps.append((op, current_mat()))

        # Eliminate all other rows (above AND below)
        for r in range(n):
            if r == pivot_row or M[r][col] == 0:
                continue
            factor = simplify(M[r][col])  # pivot is 1, so factor = M[r][col]/1
            M[r] = [simplify(M[r][c] - factor * M[pivot_row][c]) for c in range(m)]
            steps.append((_elim_op_label(r, pivot_row, factor), current_mat()))

        pivot_row += 1

    return steps
