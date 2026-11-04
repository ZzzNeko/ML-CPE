"""Render concise Markdown training report from metrics and source counts."""
import argparse,json
from pathlib import Path
def main():
 p=argparse.ArgumentParser();p.add_argument("--metrics",type=Path,required=True);p.add_argument("--dataset",type=Path,required=True);p.add_argument("--output",type=Path,required=True);a=p.parse_args()
 m=json.loads(a.metrics.read_text());d=json.loads(a.dataset.read_text())
 out=["# FitQuest CNN — Real 8-class evaluation","","> No synthetic samples were included. Self-Data participants are grouped in the split; Physical/ArmRaise clips are split by video.","","## Dataset source frame counts",""]
 for source,counts in d["counts"].items():
  out.append(f"- **{source}**: "+", ".join(f"{k}={v:,}" for k,v in counts.items()))
 out += ["","## Split","",f"- Windows: {m['windows']}","",f"- Split unit: {m['training']['split_unit']}","", "## Metrics",""]
 for split in ("validation","test"):
  x=m[split];out += [f"### {split.title()}","",f"- Accuracy: **{x['accuracy']:.4f}**",f"- Macro F1: **{x['f1_macro']:.4f}**","", "| Class | F1 |","|---|---:|"]
  out += [f"| {c} | {v:.4f} |" for c,v in x["f1_per_class"].items()];out.append("")
 out += ["## Charts","", "- `reports/training_curves.png`","- `reports/test_confusion_matrix.png`","- `reports/test_class_f1.png`","", "## Caveat","", "The dataset has only two Self-Data participant groups; participant-independent generalization is therefore limited. Treat test metrics as an initial benchmark, not a clinical or production guarantee."]
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text("\n".join(out)+"\n")
if __name__=="__main__":main()
