#!/usr/bin/env python3
import json
import os
import re
import sys
import shutil
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

URL = os.environ.get('SUPABASE_URL', '').strip().rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
DEST = Path(__file__).resolve().parents[1] / 'public' / 'lessons'


def request(path, *, binary=False):
    req = urllib.request.Request(URL + path, headers={
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'User-Agent': 'TilliTalk-Lesson-Exporter/1.0',
    })
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            body = response.read()
            return body if binary else json.loads(body)
    except urllib.error.HTTPError as exc:
        print('Failed endpoint:', path.split('?')[0], flush=True)
        print('HTTP status:', exc.code, flush=True)
        print('Reason:', exc.reason, flush=True)
        raise


def fetch_all(table, select):
    results = []
    while True:
        query = urllib.parse.urlencode({
            'select': select, 'limit': '500',
            'offset': str(len(results)), 'order': 'id.asc',
            'is_published': 'eq.true',
        })
        batch = request('/rest/v1/' + table + '?' + query)
        if not batch:
            return results
        results.extend(batch)


def main():
    if not URL.startswith('https://') or not KEY:
        sys.exit('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY securely.')
    print('Reading published media records...', flush=True)
    media = fetch_all('media', 'id,title,media_type,storage_path')
    print('Reading approved questions...', flush=True)
    questions = fetch_all('questions', 'id,media_id,question_text,correct_answer,distractors,language')
    by_media = {}
    for q in questions:
        if not (q.get('question_text') or '').strip() or not (q.get('correct_answer') or '').strip():
            continue
        distractors = q.get('distractors') or ''
        if isinstance(distractors, list):
            distractors = ', '.join(distractors)
        by_media.setdefault(str(q['media_id']), []).append({
            'id': q['id'], 'language': q.get('language') or 'en',
            'question': q['question_text'].strip(),
            'answer': q['correct_answer'].strip(), 'distractors': distractors,
        })
    lessons = []
    with tempfile.TemporaryDirectory(prefix='tillitalk-export-') as tmp:
        temp = Path(tmp) / 'lessons'
        folder = temp / 'media'
        folder.mkdir(parents=True)
        for item in media:
            qs = by_media.get(str(item['id']), [])
            if not qs:
                continue
            path = item['storage_path']
            encoded = '/'.join(urllib.parse.quote(part, safe='') for part in path.split('/'))
            raw = request('/storage/v1/object/authenticated/lesson-media/' + encoded, binary=True)
            if not raw:
                raise RuntimeError('Empty media file: ' + path)
            suffix = Path(path).suffix.lower()
            if not re.fullmatch(r'\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v)', suffix):
                suffix = '.bin'
            name = str(item['id']) + suffix
            if not re.fullmatch(r'[a-zA-Z0-9._-]+', name):
                raise RuntimeError('Invalid media filename')
            (folder / name).write_bytes(raw)
            lessons.append({'id': item['id'], 'title': item['title'], 'type': item['media_type'], 'media': '/lessons/media/' + name, 'questions': qs})
            print('Exported: ' + item['title'], flush=True)
        if not lessons:
            sys.exit('No approved lessons found. Existing bundle unchanged.')
        (temp / 'manifest.json').write_text(json.dumps({'version': 1, 'lessons': lessons}, ensure_ascii=False, indent=2), encoding='utf-8')
        if DEST.exists():
            shutil.rmtree(DEST)
        shutil.copytree(temp, DEST)
    print('TilliTalk offline export complete!')
    print(f'Pictures and videos: {len(lessons)}')
    print('Approved questions:', sum(len(item['questions']) for item in lessons))


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as exc:
        sys.exit(f'Supabase returned HTTP {exc.code}. See failed endpoint above.')
