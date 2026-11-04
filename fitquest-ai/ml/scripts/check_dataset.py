from __future__ import annotations
import argparse, csv
from pathlib import Path

def inspect(path: Path):
    print(f'Folder: {path.resolve()}')
    for name in ['landmarks.csv','labels.csv','angles.csv','calculated_3d_distances.csv','xyz_distances.csv']:
        p=path/name
        if not p.exists():
            continue
        with p.open('r', encoding='utf-8-sig', newline='') as f:
            r=csv.reader(f)
            header=next(r, [])
            rows=sum(1 for _ in r)
        print(f'  {name}: {rows:,} rows')
        print('    columns:', ', '.join(header[:25]))
if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('folder', type=Path); args=ap.parse_args(); inspect(args.folder)
