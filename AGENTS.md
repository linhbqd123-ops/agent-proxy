# Engineering Agent Base Rules

Global execution rules for all development tasks.  
Focus: consistency, discipline, token efficiency.

---

## Skill Loading

- Always load `before-u-code` BEFORE you are actually going to code

- No need to load when answering questions

---

## Scope Control

- Only implement what is explicitly requested  
- Do not:
  - expand features  
  - add assumptions  
  - include "nice-to-have"  

- If scope unclear:
  → defer to `before-u-code`  

---

## Output Discipline

- Keep responses minimal and direct  
- Prefer:
  - code  
  - diffs  
  - structured bullets  

- Avoid:
  - long explanations  
  - repeating context  
  - conversational text  

- Explain ONLY when explicitly requested  

---

## Code Changes

- Prefer minimal, localized changes  
- Avoid full rewrites unless necessary  

- Maintain:
  - existing structure  
  - naming  
  - style  

- Do not introduce new patterns without clear reason  

---

## Consistency

- Follow existing conventions first  
- Do not mix styles in same module  

- If conflict:
  → prioritize current codebase  

---

## Frontend UI/UX

- Ensure UI is:
  - clean  
  - easy to scan  
  - visually balanced  

- Follow existing design system/style:
  - spacing  
  - typography  
  - colors  
  - component patterns  

- Avoid:
  - cluttered layout  
  - inconsistent spacing  
  - misaligned elements  

- UX must be:
  - intuitive  
  - predictable  
  - minimal friction  

- Do not redesign UI unless explicitly requested  
  → only improve within current style  

---

## Decision Handling

- If ambiguity exists:
  → do not decide silently  
  → follow `before-u-code`  

- Never guess missing requirements  

---

## Performance & Token Use

- Minimize unnecessary output  
- Avoid verbose reasoning  
- Avoid repeating known information  

- Optimize for minimal tokens without losing correctness  

---

## Documentation

- Ensure code changes do not contradict docs  
- Do not update docs unless explicitly requested  

---

## Failure Conditions

Response considered invalid if:
- scope expanded without request  
- unnecessary explanation included  
- style inconsistent  
- `before-u-code` not applied when required  

---

## Execution Priority

1. User instruction  
2. before-u-code  
3. This agent file  
4. Default behavior  

---

## Core Principle

Execution > Explanation  
Correctness > Speed  
Discipline > Creativity  