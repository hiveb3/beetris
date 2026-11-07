#!/usr/bin/env python3
"""Hive reward-concentration & vote-ring check for a community (public on-chain data only).

Usage:  python3 hive-farm-check.py hive-110713 [days=14] [api=https://api.hive.blog]
Output: report on screen + farm-report-<community>.csv / .json

It measures, it does not accuse: high numbers are signals to look at by hand.
"""
import json, sys, time, urllib.request, collections, csv, datetime as dt

COMM = sys.argv[1] if len(sys.argv) > 1 else 'hive-110713'
DAYS = int(sys.argv[2]) if len(sys.argv) > 2 else 14
API = sys.argv[3] if len(sys.argv) > 3 else 'https://api.hive.blog'
CUTOFF = dt.datetime.utcnow() - dt.timedelta(days=DAYS)

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    for i in range(5):
        try:
            r = urllib.request.urlopen(urllib.request.Request(API, body, {"Content-Type": "application/json"}), timeout=30)
            d = json.load(r)
            if 'result' in d: return d['result']
        except Exception as e:
            time.sleep(2 + i * 2)
    raise SystemExit(f'API error on {method}')

amt = lambda s: float(str(s).split()[0]) if s else 0.0

# 1. all posts of the community in the window
posts, last = [], None
while True:
    p = {"sort": "created", "tag": COMM, "limit": 20, "observer": ""}
    if last: p.update(start_author=last[0], start_permlink=last[1])
    page = rpc('bridge.get_ranked_posts', p)
    if last and page: page = page[1:]
    if not page: break
    stop = False
    for x in page:
        if dt.datetime.fromisoformat(x['created']) < CUTOFF: stop = True; break
        posts.append(x)
    if stop: break
    last = (page[-1]['author'], page[-1]['permlink'])
    print(f'\r{len(posts)} posts…', end='', flush=True)
print(f'\r{len(posts)} posts in the last {DAYS} days of {COMM}')
if not posts: raise SystemExit('no posts')

# 2. votes on each post
payout = collections.Counter()               # author -> pending+paid payout
votes = collections.defaultdict(collections.Counter)   # voter -> author -> rshares
vote_count = collections.defaultdict(collections.Counter)
delays = collections.defaultdict(list)       # voter -> seconds after post creation
for i, x in enumerate(posts):
    a = x['author']
    payout[a] += x.get('payout', 0) or (amt(x.get('pending_payout_value')) + amt(x.get('author_payout_value')) + amt(x.get('curator_payout_value')))
    created = dt.datetime.fromisoformat(x['created'])
    for v in rpc('condenser_api.get_active_votes', [a, x['permlink']]):
        rs = int(v.get('rshares', 0))
        if rs <= 0: continue
        votes[v['voter']][a] += rs
        vote_count[v['voter']][a] += 1
        try: delays[v['voter']].append((dt.datetime.fromisoformat(v['time']) - created).total_seconds())
        except Exception: pass
    print(f'\rvotes {i+1}/{len(posts)}', end='', flush=True)
print()

total = sum(payout.values()) or 1
ranked = payout.most_common()
received = collections.Counter()
for vt, m in votes.items():
    for au, rs in m.items(): received[au] += rs

# 3. concentration
def gini(vals):
    v = sorted(vals); n = len(v); s = sum(v)
    return 0 if not s else sum((2 * i - n + 1) * x for i, x in enumerate(v)) / (n * s)
top_n = 0; acc = 0
for _, p in ranked:
    acc += p; top_n += 1
    if acc >= 0.75 * total: break
print(f'\n=== CONCENTRATION ===\nauthors: {len(ranked)}  total payout: {total:.2f} $')
print(f'{top_n} authors ({top_n/len(ranked):.0%}) take 75% of rewards · Gini {gini([p for _, p in ranked]):.2f} (0 equal, 1 one takes all)')
for a, p in ranked[:15]: print(f'  @{a:<18} {p:9.2f} $  {p/total:6.1%}  posts {sum(1 for x in posts if x["author"]==a)}')

# 4. reciprocity: A votes B and B votes A
print('\n=== RECIPROCAL VOTE PAIRS (both directions, by rshares) ===')
pairs = []
for a in votes:
    for b, rs in votes[a].items():
        if a < b and votes.get(b, {}).get(a):
            pairs.append((min(rs, votes[b][a]), a, b, vote_count[a][b], vote_count[b][a]))
for s, a, b, ca, cb in sorted(pairs, reverse=True)[:20]:
    print(f'  @{a} ⇄ @{b}   votes {ca}/{cb}')

# 5. loyal voters: a big share of a voter's rshares goes to one author (possible alt / trail / buyer)
print('\n=== FOCUSED VOTERS (>=60% of their community voting power to one author, >=3 votes) ===')
focused = []
for vt, m in votes.items():
    tot = sum(m.values()); au, rs = m.most_common(1)[0]
    if tot and rs / tot >= 0.6 and vote_count[vt][au] >= 3 and vt != au:
        focused.append((rs, vt, au, rs / tot, vote_count[vt][au]))
for rs, vt, au, share, n in sorted(focused, reverse=True)[:25]:
    print(f'  @{vt:<18} -> @{au:<18} {share:5.0%} of its votes ({n} votes)')

# 6. self-votes and bot-like timing
print('\n=== SELF-VOTES & BOT TIMING ===')
for a, _ in ranked[:15]:
    sv = votes.get(a, {}).get(a, 0); share = sv / received[a] if received[a] else 0
    if share > 0.05: print(f'  @{a} self-vote = {share:.0%} of rshares received')
for vt, ds in delays.items():
    if len(ds) >= 5:
        ds = sorted(ds); med = ds[len(ds)//2]
        spread = ds[int(len(ds)*0.8)] - ds[int(len(ds)*0.2)]
        if spread < 60: print(f'  @{vt:<18} always votes ~{med/60:.1f} min after posting (spread {spread:.0f}s, {len(ds)} votes) → automated')

# 7. who feeds the top: share of top-author rshares coming from their 5 biggest voters
print('\n=== DEPENDENCE OF TOP AUTHORS ON FEW VOTERS ===')
by_author = collections.defaultdict(collections.Counter)
for vt, m in votes.items():
    for au, rs in m.items(): by_author[au][vt] += rs
for a, _ in ranked[:10]:
    t = received[a] or 1; top5 = by_author[a].most_common(5)
    print(f'  @{a:<18} top-5 voters give {sum(r for _, r in top5)/t:5.0%}: ' + ', '.join(f'@{v} {r/t:.0%}' for v, r in top5))

# 8. save
tag = COMM.replace('/', '_')
with open(f'farm-report-{tag}.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['voter', 'author', 'votes', 'rshares'])
    for vt, m in votes.items():
        for au, rs in m.items(): w.writerow([vt, au, vote_count[vt][au], rs])
json.dump({'community': COMM, 'days': DAYS, 'payout': dict(payout), 'pairs': [p[1:3] for p in pairs], 'focused': [f[1:3] for f in focused]},
          open(f'farm-report-{tag}.json', 'w'), indent=1)
print(f'\nSaved farm-report-{tag}.csv (full voter→author matrix) and .json')
