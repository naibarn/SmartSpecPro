# Motion Guidelines

Motion should clarify, not distract.

Use motion for:

- Page entrance orchestration.
- State transitions.
- Expand/collapse.
- Modal/sheet entrance and exit.
- Hover feedback on meaningful cards.

Avoid:

- Animating every element the same way.
- Slow routine interactions.
- Motion that blocks input.
- Parallax that harms readability.

Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```
