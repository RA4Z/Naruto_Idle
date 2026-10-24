"""Read-only, source-exact accounting for one exported-animation plan.

This inventories existing pixel-proof metadata; it does not rerender frames,
verify artifact bytes, infer skill bindings, or report whole-project completion.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import time


def read_document(path):
    for attempt in range(3):
        raw = Path(path).read_bytes()
        try:
            payload = gzip.decompress(raw) if str(path).endswith('.gz') else raw
            return json.loads(payload), hashlib.sha256(raw).hexdigest()
        except (json.JSONDecodeError, EOFError):
            if attempt == 2:
                raise
            time.sleep(0.05)


def plan_jobs(plan):
    rows = plan.get('jobs')
    if rows is None:
        rows = [job for batch in plan['batches'] for job in batch['jobs']]
    jobs = {}
    for job in rows:
        key = job['key']
        if key in jobs:
            raise ValueError('Duplicate planned action: ' + key)
        expected = ('source:' + hashlib.sha256(job['resource'].encode()).hexdigest()[:16]
                    + ':' + hashlib.sha256(job['action'].encode()).hexdigest()[:12])
        if key != expected or job['source']['path'] != job['resource']:
            raise ValueError('Plan identity disagrees with original source: ' + key)
        jobs[key] = job
    return jobs


def exact_entry(job, entry):
    return (entry.get('id') == job['key'] and entry.get('source') == job['source']
            and len(entry.get('layers', [])) == 1
            and entry['layers'][0].get('action') == job['action'])


def pixel_metadata(entry):
    for layer in entry.get('layers', []):
        proof = layer.get('validation', {})
        hashes = proof.get('frameRgbaSha256', [])
        frames = proof.get('nativeFrames')
        if (type(frames) is not int or frames <= 0 or len(hashes) != frames
                or any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value) for value in hashes)
                or proof.get('allFramesPixelExact') is not True
                or proof.get('originalCoordinatesPreserved') is not True
                or proof.get('sourcePixelScale') != 1):
            raise ValueError('Published action lacks complete source-pixel metadata: ' + entry['id'])


def reason_code(row):
    text = str(row.get('rendererDetail', '')) + str(row.get('reason', ''))
    if 'canvas budget' in text.lower() or 'canvas bounds' in text.lower():
        return 'canvas-budget'
    if 'byte budget' in text.lower():
        return 'source-byte-budget'
    if 'Timeout' in text or 'timed out' in text.lower():
        return 'renderer-timeout'
    if 'transparent' in text.lower() or 'empty' in text.lower():
        return 'nonvisual-review-required'
    return 'explicit-review-required'


def inventory(plan, published, staging, nonvisual=None):
    jobs = plan_jobs(plan)
    public = published.get('sourceExports', {})
    prepared = staging.get('sourceExports', {})
    deferred = staging.get('deferred', {})
    review_document = nonvisual or {}
    review_rows = review_document.get('rows', review_document.get('reviewedNonvisualSourceActions', []))
    reviewed = {}
    for item in review_rows:
        row = item.get('proof', item)
        if row['key'] in reviewed:
            raise ValueError('Duplicate nonvisual review: ' + row['key'])
        reviewed[row['key']] = row
    counts = Counter({name: 0 for name in ('published', 'prepared-unpublished',
        'reviewed-nonvisual', 'deferred-not-substituted', 'not-attempted-in-staging')})
    reasons, rows = Counter(), []
    for key, job in jobs.items():
        if key in public:
            if not exact_entry(job, public[key]):
                raise ValueError('Published source/action differs from plan: ' + key)
            pixel_metadata(public[key])
            state = 'published'
        elif key in reviewed:
            proof = reviewed[key]
            if (proof.get('source') != job['source'] or proof.get('action') != job['action']
                    or proof.get('allFramesTransparent') is not True
                    or proof.get('state') != 'source-empty-display-timeline-reviewed-not-an-animation'):
                raise ValueError('Nonvisual review does not match source: ' + key)
            state = 'reviewed-nonvisual'
        elif key in prepared:
            if not exact_entry(job, prepared[key]):
                raise ValueError('Prepared source/action differs from plan: ' + key)
            state = 'prepared-unpublished'
        elif key in deferred:
            state = 'deferred-not-substituted'
        else:
            state = 'not-attempted-in-staging'
        row = {'key': key, 'source': job['source'], 'action': job['action'], 'state': state}
        if state == 'deferred-not-substituted':
            row['reasonCode'] = reason_code(deferred[key])
            reasons[row['reasonCode']] += 1
        counts[state] += 1
        rows.append(row)
    assert sum(counts.values()) == len(jobs)
    return {'scope': 'Exact action intersection with this plan only; not overall project completion. '
            'Existing publication pixel metadata is checked, not rerendered or rehashed. '
            'Prepared entries are not claimed as published or independently validated. '
            'Source sequences may still need a production runtime adapter. '
            'Inputs are individually hashed snapshots, not a transaction across active workers.',
        'summary': {'plannedActions': len(jobs), 'partition': dict(counts),
            'publishedPlanPercent': round(100 * counts['published'] / len(jobs), 2) if jobs else None,
            'publishedAllSourceExports': len(public),
            'publishedOutsidePlan': len(set(public) - set(jobs)),
            'deferredReasonCounts': dict(reasons)}, 'rows': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--published-index', required=True)
    parser.add_argument('--staging-index', required=True)
    parser.add_argument('--nonvisual-review')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    documents, hashes = {}, {}
    for label in ('plan', 'published_index', 'staging_index', 'nonvisual_review'):
        path = getattr(args, label)
        if path:
            documents[label], hashes[label] = read_document(path)
    report = inventory(documents['plan'], documents['published_index'],
                       documents['staging_index'], documents.get('nonvisual_review'))
    report.update(snapshotUtc=datetime.now(timezone.utc).isoformat(), inputSha256=hashes)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Only the explicitly selected report is written; no source/catalog mutation.
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
