from pathlib import Path
import json,re,zipfile,hashlib,os
from PIL import Image
import yaml
root=Path(__file__).resolve().parents[1]
specs={int(p.parent.name[:3]):p for p in (root/'specs/feature').glob('*/spec.md')}
assert len(specs)==13
alltexts={n:p.read_text(encoding='utf-8') for n,p in specs.items()}
low={n:s.lower() for n,s in alltexts.items()}
passed=[]

def check(name, a, detail):
 passed.append({'pass':len(passed)+1,'name':name,'ok':bool(a),'detail':detail})
 if not a: print('FAIL',name,detail)

# Each pass loops over the same 13 specs rather than checking one or two documents.
check('Revision and full SPEC family',set(specs)==set(range(312,325)) and all('## R1.4 — Cross-SPEC owner reconciliation' in s for s in alltexts.values()),'13/13 SPECs have controlling R1.4 clause; numbered slots 312–324')
check('Product identity and three domains',all(all(d in s for d in ['smartsihub.com','aimarkethubs.com','smartaihub.app']) for s in low.values()),'13/13 distinguish verified production, Debian UAT and legacy command center')
check('P0–P7 owner priority',all(all(f'p{i}' in s for i in range(8)) for s in low.values()),'13/13 include ordered P0 repair→Core→Chat→Creator→Autonomy→handover→public→others')
check('Lean fresh Core and isolated data',all(('hono' in s and 'rust' in s and 'smartspec' in s and 'd1' in s) for s in low.values()),'13/13 specify Hono Core, Rust supervisor and core-db/new-app separation')
check('One job and economic authority',all('worker_jobs' in s and 'ledger' in s and 'idempot' in s for s in low.values()),'13/13 mention canonical jobs, ledger and duplicate-effect protection')
check('Financial and subscriptions decision',all('10,000' in s and 'referral' in s and 'shared' in s and 'subscription' in s for s in low.values()),'13/13 contain credit version, four roles, referral once, two subscriptions/shared skill nuance')
check('Mini App hosting and app-exclusive data',all('byoc' in s and 'mini app' in s and 'postgres' in s for s in low.values()),'13/13 carry BYOC/independent app DB boundaries')
images=list((root/'assets/mockups').glob('*.png'))
imageok=len(images)==3 and all(Image.open(p).size[0]>=1500 and Image.open(p).size[1]>=800 for p in images)
check('UI three themes + inline OpenUI',imageok and all(('openui' in s and 'light' in s and 'dark' in s and 'balance' in s) for s in low.values()),'3 real images available + 13/13 include inline UI, theme and admin visibility')
check('Computer Use and Clef provider safety',all(('moli' in s and 'chromium' in s and 'clef' in s and 'spec-208' in s) for s in low.values()),'13/13 reiterate speculative routing vs verified executors, Moli not production qualified')
# Structural safety, static links & parsing
broken=[]
for f in root.rglob('*.md'):
 s=f.read_text(errors='replace')
 for m in re.finditer(r'(?<!!)\[[^\]]*\]\(([^)]+)\)',s):
  target=m.group(1).split('#')[0].strip()
  if target and not target.startswith(('https://','http://','mailto:','data:','skills://','sandbox:')):
   # Skip intentionally generic placeholders and URLs with colons
   if target.startswith('<') or target.startswith('{'): continue
   if not (f.parent/target).exists(): broken.append({'file':str(f.relative_to(root)),'target':target})
jsonerr=[]
for f in root.rglob('*.json'):
 try: json.loads(f.read_text())
 except Exception as e: jsonerr.append((str(f.relative_to(root)),str(e)))
yamlerr=[]
for f in root.rglob('*.yaml'):
 try: yaml.safe_load(f.read_text())
 except Exception as e: yamlerr.append((str(f.relative_to(root)),str(e)))
check('Artifact contracts & navigation',not (broken or jsonerr or yamlerr) and (root/'docs/architecture/R1.4-OWNER-DECISION-PRECEDENCE.md').exists(),'cross-links + JSON/YAML parse + 13 SPECs; missing links count '+str(len(broken)))
result={'review_date':'2026-11-01','scope':'13 newly authored SPEC-312–324 plus supporting docs and relevant legacy authorities (not all 307 legacy SPEC full-texts)','total_passes':len(passed),'passed':sum(x['ok'] for x in passed),'checks':passed,'broken_links':broken,'json_errors':jsonerr,'yaml_errors':yamlerr,'reference_mockups':[{'name':p.name,'pixels':Image.open(p).size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(images)],'status':'DRAFT_ONLY_NOT_IMPLEMENTED'}
(root/'reviews/R1.4-STATIC-VALIDATION.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({k:result[k] for k in ['total_passes','passed','broken_links','json_errors','yaml_errors']},indent=2))
if len(passed)!=10 or any(not x['ok'] for x in passed): raise SystemExit(1)
