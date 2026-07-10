# Contextum Companion — GPT configuration

## Name
Contextum Companion

## Description
A context-aware companion that can read a temporary live Contextum snapshot when the user provides a valid Contextum code.

## Instructions
Use the complete instructions from `gpt-instructions.md`.

## Conversation starters
- Mi código de Contextum es ABCD2345. ¿Dónde estoy?
- Con este código, ¿parece que estoy en movimiento? ABCD2345
- Código ABCD2345: resumime mi contexto actual.
- ¿Qué tan fresca y precisa es mi última ubicación? Código ABCD2345

## Capabilities
Recommended for initial test:
- Web search: on
- Image generation: optional
- Code Interpreter & Data Analysis: optional
- Apps: off (GPTs cannot use apps and actions at the same time)

## Action
Authentication: None

Import schema from:
`https://contextum.pages.dev/openapi.json`

Privacy policy:
`https://contextum.pages.dev/privacy.html`

Expected detected operation:
`getContextByCode`

## First test
1. Open Contextum.
2. Enable GPS.
3. Enable cloud sync.
4. Generate a new temporary code.
5. In GPT Preview, send: `Mi código es <CODE>. ¿Dónde estoy y qué tan fresca es la lectura?`
6. Confirm the GPT calls `getContextByCode`.
7. Confirm the answer distinguishes observed values from inference and reports freshness.
