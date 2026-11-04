"""Build a real-only 8-class sequence dataset from Self-Data, Physical Exercise Recognition and Arm Raise clips."""
from __future__ import annotations
import argparse, csv, json
from pathlib import Path
from build_combined_standing_dataset import csv_header, extract_arm_raise_video, ARM_RAISE_FOLDERS
from generate_synthetic_pose_dataset import NAMES

CLASSES = {"arm_raise", "jumping_jack", "squat", "standing", "left_arm_up", "right_arm_up", "knee_left", "knee_right"}

def write_self(root, lw, yw):
    labels = {r["vid_id"]: r for r in csv.DictReader((root/"labels.csv").open(encoding="utf-8-sig"))}
    counts={}
    labeled=set()
    with (root/"landmarks.csv").open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            src=row["vid_id"]; lab=labels.get(src)
            if not lab: continue
            cls=lab["class"].strip().lower()
            if cls not in CLASSES: continue
            group=lab.get("group_id","").strip() or f"self-{src}"
            vid=f"self_{src}"
            if vid not in labeled:
                yw.writerow([vid,cls,group])
                labeled.add(vid)
            lw.writerow([vid,row["frame_order"],*[row[c] for c in csv_header()[2:]]])
            counts[cls]=counts.get(cls,0)+1
    return counts

def write_physical(root,lw,yw):
    labels={r["vid_id"]:r["class"].strip().lower() for r in csv.DictReader((root/"labels.csv").open(encoding="utf-8-sig"))}
    counts={}
    labeled=set()
    with (root/"landmarks.csv").open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            src=row["vid_id"]; cls=labels.get(src)
            if cls not in {"jumping_jack","squat"}: continue
            vid=f"physical_{src}"
            if vid not in labeled:
                yw.writerow([vid,cls,vid])
                labeled.add(vid)
            lw.writerow([vid,row["frame_order"],*[row[c] for c in csv_header()[2:]]])
            counts[cls]=counts.get(cls,0)+1
    return counts

def write_arm(root,lw,yw,model,fps,window):
    import mediapipe as mp, cv2
    options=mp.tasks.vision.PoseLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(model.resolve())),running_mode=mp.tasks.vision.RunningMode.VIDEO,num_poses=1)
    counts={"arm_raise":0}; idx=0
    for folder in ARM_RAISE_FOLDERS:
        for path in sorted((root/folder).glob("*.mp4")):
            # VIDEO timestamps must increase for one detector instance.
            # Create a fresh detector for each clip because every clip starts at t=0.
            with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
                frames=extract_arm_raise_video(path,detector,mp.ImageFormat.SRGB,fps,mp.Image)
            if len(frames)<window:
                print(f"Skipping {path.name}: only {len(frames)} pose frames",flush=True)
                continue
            vid=f"armraise_{idx:04d}"; yw.writerow([vid,"arm_raise",vid])
            for n,frame in enumerate(frames): lw.writerow([vid,n,*frame])
            counts["arm_raise"]+=len(frames); idx+=1
            print(f"{path.name}: {len(frames)} landmarks",flush=True)
    return counts

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--self-data",type=Path,default=Path("Self-Data"))
    p.add_argument("--physical",type=Path,default=Path("Physical Exercise Recognition"))
    p.add_argument("--arm-root",type=Path,default=Path("."))
    p.add_argument("--pose-model",type=Path,required=True)
    p.add_argument("--output",type=Path,default=Path("ml/data/combined-real-8class"))
    p.add_argument("--fps",type=float,default=10);p.add_argument("--window",type=int,default=30)
    a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True)
    counts={}
    with (a.output/"landmarks.csv").open("w",newline="") as lf,(a.output/"labels.csv").open("w",newline="") as yf:
        lw,yw=csv.writer(lf),csv.writer(yf);lw.writerow(csv_header());yw.writerow(["vid_id","class","group_id"])
        counts["self_data_frames"]=write_self(a.self_data,lw,yw)
        counts["physical_frames"]=write_physical(a.physical,lw,yw)
        counts["arm_raise_frames"]=write_arm(a.arm_root,lw,yw,a.pose_model,a.fps,a.window)
    meta={"dataset":"combined-real-8class","classes":sorted(CLASSES),"synthetic_data_included":False,"split_unit":"participant group for Self-Data; video for other sources","counts":counts}
    (a.output/"dataset_info.json").write_text(json.dumps(meta,indent=2)+"\n")
    print(json.dumps(counts,indent=2))
if __name__=="__main__": main()
