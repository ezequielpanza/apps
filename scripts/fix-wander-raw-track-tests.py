from pathlib import Path

path = Path('apps/wander-travel/tests/app-shell.mjs')
text = path.read_text(encoding='utf-8')
old = "assert.match(versionRuntime, /localStorage\\.getItem\\(RECENT_TRACKS_KEY\\) === null/);"
new = "assert.match(versionRuntime, /RECENT_TRACKS_MIGRATION_KEY/);\nassert.match(versionRuntime, /stored === null \\|\\| stored === '0'/);"
if text.count(old) != 1:
    raise RuntimeError(f'Expected one migration assertion, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
