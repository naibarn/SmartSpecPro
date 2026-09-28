#!/usr/bin/env bash
set -euo pipefail
BUNDLE="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$BUNDLE" <<'PY'
import json, os, sys

bundle = sys.argv[1]
errors = []
for root, _, files in os.walk(bundle):
    for name in files:
        if name.endswith('.json'):
            path = os.path.join(root, name)
            try:
                with open(path, encoding='utf-8') as handle:
                    json.load(handle)
            except Exception as exc:
                errors.append(f'{os.path.relpath(path, bundle)}: {exc}')

required = [
    'skill.json', 'SKILL.md', 'skill.md',
    'schemas/input.schema.json', 'schemas/output.schema.json',
    'schemas/ui.schema.json', 'prompts/system.prompt.md',
    'references/input_contract.md', 'references/output_contract.md',
    'references/maintenance.md', 'help/help.th.md', 'help/help.en.md',
    'examples/example.input.th.json', 'examples/example.output.sample.json',
    'fixtures/pass.input.json', 'fixtures/pass.output.json',
    'fixtures/fail.input.json', 'fixtures/fail.output.json',
    'tests/tests.json',
]
for rel in required:
    if not os.path.isfile(os.path.join(bundle, rel)):
        errors.append(f'missing required file: {rel}')

manifest = json.load(open(os.path.join(bundle, 'skill.json'), encoding='utf-8'))
if manifest.get('smartspec_slug') != 'vertical-drama-character-look-designer':
    errors.append('manifest slug mismatch')
if manifest.get('contract_version') != 1:
    errors.append('manifest contract version mismatch')
output = json.load(open(os.path.join(bundle, 'fixtures/pass.output.json'), encoding='utf-8'))
if output.get('contract_version') != 1 or not output.get('designs'):
    errors.append('pass fixture missing contract/designs')
fail = json.load(open(os.path.join(bundle, 'fixtures/fail.output.json'), encoding='utf-8'))
if fail.get('contract_version') == 1 and fail.get('designs'):
    errors.append('fail fixture does not violate declared contract')

if errors:
    print('[look-designer] FAIL')
    print('\n'.join(errors))
    sys.exit(1)
print('[look-designer] OK (no provider calls made)')
PY
