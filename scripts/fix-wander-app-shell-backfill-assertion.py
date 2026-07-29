from pathlib import Path

path = Path('apps/wander-travel/tests/app-shell.mjs')
text = path.read_text(encoding='utf-8')
old = "assert.match(sources.sessionEngine, /lat: finite\\(closedStay\\?\\.center\\?\\.lat\\) \\?\\? position\\.lat/);"
new = "assert.match(sources.sessionEngine, /if \\(stay\\) closeStay\\(Number\\(firstPoint\\.at \\|\\| at\\)\\)/);"
if text.count(old) != 1:
    raise RuntimeError(f'Expected one stale anchor assertion, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
