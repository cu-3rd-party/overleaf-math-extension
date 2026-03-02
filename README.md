# Linal — расширение для Overleaf

Chrome-расширение, которое добавляет математические вычисления прямо на [Overleaf](https://www.overleaf.com/) — на основе [SymPy](https://www.sympy.org), работающего в браузере через [Pyodide](https://pyodide.org/).

## Что умеет

Выдели любой фрагмент LaTeX на Overleaf и нажми **f(x) Evaluate** во всплывающей кнопке. Результат вставится сразу после выделения.

### Арифметика и алгебра

```latex
\frac{1}{2} + \frac{1}{3}           →   = \frac{5}{6}
(x + 1)^2                            →   = x^2 + 2x + 1
\frac{x^2 - 1}{x - 1}               →   = x + 1
```

### Производные

```latex
(x^3)'                               →   = 3x^2
(\sin x)'                            →   = \cos(x)
(x^2 y)'                             →   = 2xy
```

### Интегралы

```latex
\int x^2 \, dx                        →   = \frac{x^3}{3}
\int_0^1 x^2 \, dx                    →   = \frac{1}{3}
\int e^x \sin(x) \, dx               →   = \frac{e^x(\sin x - \cos x)}{2}
```

### Суммы и произведения

```latex
\sum_{k=1}^{n} k                      →   = \frac{n(n+1)}{2}
\sum_{k=0}^{\infty} \frac{1}{2^k}    →   = 2
\prod_{k=1}^{n} k                     →   = n!
```

### Пределы

```latex
\lim_{x \to 0} \frac{\sin x}{x}      →   = 1
\lim_{x \to \infty} \frac{1}{x}      →   = 0
```

### Тригонометрия и специальные функции

```latex
\sin(\pi)                             →   = 0
\cos\left(\frac{\pi}{3}\right)        →   = \frac{1}{2}
e^{i\pi}                              →   = -1
\ln(e^3)                              →   = 3
```

### Матричные операции

```latex
\det\begin{pmatrix}1&2\\3&4\end{pmatrix}      →   = -2
\tr\begin{pmatrix}1&2\\3&4\end{pmatrix}        →   = 5

\begin{pmatrix}1&2\\3&4\end{pmatrix}\begin{pmatrix}1&2\\3&4\end{pmatrix} = \begin{pmatrix}7 & 10 \\ 15 & 22\end{pmatrix}

\operatorname{rref}\left(\begin{pmatrix}1&2\\3&4\end{pmatrix}\right)
% → приведённая ступенчатая форма (RREF)

\operatorname{gauss}\left(\begin{pmatrix}1&2\\3&4\end{pmatrix}\right)
% → ступенчатая форма (метод Гаусса)
```

### НОД, НОК, факториал

```latex
\gcd(12, 18)      →   = 6
10!               →   = 3628800
```

## Архитектура

```
Контент-скрипт (страница Overleaf)
    ↕ chrome.runtime.sendMessage
Фоновый service worker
    ↕ relay
Offscreen document
    └─ Pyodide WASM
        └─ lmat_cas_client (lark-парсер → SymPy → LmatLatexPrinter)
```

- **LaTeX → SymPy** — разбирается через [`lmat_cas_client`](obsidian-latex-math/lmat-cas-client/) с LALR-грамматикой (`lark`)
- **SymPy → LaTeX** — печатается обратно через `LmatLatexPrinter`
- **Всё работает локально** — никаких сетевых запросов

## Сборка

```bash
npm install
npm run build   # результат в dist/
```

Загрузить `dist/` как распакованное расширение в Chrome: `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное».

## Используемые Python-пакеты

| Пакет  | Версия    | Назначение                          |
| ------ | --------- | ----------------------------------- |
| sympy  | 1.13.3    | Символьная математика               |
| mpmath | 1.3.0     | Вещественные числа высокой точности |
| lark   | 1.2.2     | LALR-парсер LaTeX                   |
| regex  | 2024.11.6 | Расширенные регулярные выражения    |

## Основа

Python-пайплайн вычислений адаптирован из [zarstensen/obsidian-latex-math](https://github.com/zarstensen/obsidian-latex-math).
