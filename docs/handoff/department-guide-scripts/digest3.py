import hashlib
import json

BASE = '/tmp/claude-0/-home-user-bcpsmarcomm/9cd69df2-9574-5317-a1e6-9dedb578c0ca/scratchpad/ece-guide/'
g = json.load(open(BASE + 'def-v3.json'))
md5 = lambda s: hashlib.md5(s.encode('utf-8')).hexdigest()
print('tabs', len(g['tabs']), 'sections', sum(len(t['sections']) for t in g['tabs']))
print('tabs_digest    ', md5(''.join(md5(s['html']) for t in g['tabs'] for s in t['sections'])))
print('overview_digest', md5(''.join(md5(o['html']) for o in g['overview'])))
print('overview_layout', ' | '.join(f"{o['id']}:{o.get('layout', '-')}:{json.dumps(o['for'], separators=(',', ':')) if o.get('for') else '-'}" for o in g['overview']))
print('tab_audiences  ', ' | '.join(f"{t['id']}:{json.dumps(t['for'], separators=(',', ':')) if t.get('for') else '-'}" for t in g['tabs']))
