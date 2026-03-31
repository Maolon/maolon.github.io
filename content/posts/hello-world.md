---
title: "Hello World"
date: 2026-03-31
tags: [meta]
description: "First post on the new site."
math: true
---

This is the first post on the rebuilt site. A clean start.

## What changed

The old site — a Hexo blog with parallax effects — is gone. Replaced by ~200 lines of TypeScript that converts Markdown to static HTML. No framework, no runtime, no magic.

## Code highlighting

```python
def softmax(z):
    exp_z = np.exp(z - np.max(z))
    return exp_z / exp_z.sum()
```

## Math rendering

Inline math: the Euler identity $e^{i\pi} + 1 = 0$ and the quadratic formula $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

Block equations:

$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

The softmax function $\sigma(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}}$ pairs with the code above.

## Video embedding

This site can embed YouTube videos using standard image syntax:

```markdown
![My Talk](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
```

Here's a live example:

![Rick Astley - Never Gonna Give You Up](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
