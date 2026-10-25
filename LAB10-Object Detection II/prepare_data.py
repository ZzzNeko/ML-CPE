"""Build dataset/{train,val,test} from PokemonData. Usage: python prepare_data.py [--force]"""
import argparse
from common import prepare_dataset

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true", help="Rebuild the split from scratch")
    prepare_dataset(force=p.parse_args().force)
