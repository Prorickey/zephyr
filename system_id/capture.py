"""
Serial console for system_id.ino that saves every test to system_id/data/.

    pip install pyserial
    python capture.py COM5            (Windows; check Device Manager / the Arduino IDE for the port)
    python capture.py /dev/ttyUSB0

Type commands (b, n 500, w 15 1.5, f 0, s 2350 105, x ...) and press Enter. Close the Arduino Serial Monitor
first: only one program can hold the port. Each "#BEGIN ... #END" block becomes data/<test>_<time>.csv,
"#STATIC" lines are appended to data/static.txt, and the whole session goes to data/session_<time>.log.
"""
import argparse
import sys
import threading
import time
from pathlib import Path

import serial

DATA = Path(__file__).resolve().parent / "data"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("port")
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()

    DATA.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    session = open(DATA / f"session_{stamp}.log", "a", encoding="utf-8")
    port = serial.Serial(args.port, args.baud, timeout=0.1)
    print(f"Connected to {args.port}. Type commands and press Enter, Ctrl+C to quit.")

    def send_input():
        for line in sys.stdin:
            port.write((line.rstrip("\r\n") + "\n").encode())

    threading.Thread(target=send_input, daemon=True).start()

    block = None
    pending = b""
    try:
        while True:
            pending += port.read(4096)
            *lines, pending = pending.split(b"\n")
            for raw in lines:
                line = raw.decode(errors="replace").rstrip("\r")
                session.write(line + "\n")
                if line.startswith("#BEGIN"):
                    block = [line]
                    meta = dict(kv.split("=", 1) for kv in line.split()[1:] if "=" in kv)
                    print(f"[receiving {meta.get('test')} run {meta.get('run')}, {meta.get('n')} samples...]")
                    continue
                if block is not None:
                    block.append(line)
                    if line.startswith("#END"):
                        meta = dict(kv.split("=", 1) for kv in block[0].split()[1:] if "=" in kv)
                        name = f"{meta.get('test', 'test')}_{time.strftime('%Y%m%d-%H%M%S')}_run{meta.get('run', 0)}.csv"
                        (DATA / name).write_text("\n".join(block) + "\n", encoding="utf-8")
                        print(f"[saved data/{name}]")
                        block = None
                    continue
                if line.startswith("#STATIC"):
                    with open(DATA / "static.txt", "a", encoding="utf-8") as f:
                        f.write(line + "\n")
                    print(f"{line}   [appended to data/static.txt]")
                    continue
                print(line)
            session.flush()
    except KeyboardInterrupt:
        pass
    finally:
        port.write(b"x")
        port.close()
        session.close()


if __name__ == "__main__":
    main()
