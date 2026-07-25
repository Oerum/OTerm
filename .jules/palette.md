## 2024-07-25 - [Accessibility gap in Interactive Rebase Builder]
**Learning:** Found an accessibility issue pattern in the Rebase Builder component where critical form elements (`<select>`, `<input>`) inside a list loop lack `aria-label`s, preventing screen readers from identifying them properly.
**Action:** Applied standard `aria-label` attributes to the dynamic dropdown and text input. Will keep a lookout for other form-heavy components (like lists or tables with inline editing) that might have similar accessibility gaps in this design system.
