#!/usr/bin/env python
# 提交并推送本站更新到 GitHub Pages（main 分支）
# 用法：python update_daily.py "提交说明"
import subprocess, sys, os

MSG = sys.argv[1] if len(sys.argv) > 1 else "update: 站点内容更新"

HERE = os.path.dirname(os.path.abspath(__file__))

def run(cmd):
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, shell=True)
    print(">", " ".join(cmd))
    print(r.stdout)
    if r.stderr:
        print(r.stderr)
    return r.returncode

if __name__ == "__main__":
    run(["git", "add", "-A"])
    run(["git", "commit", "-q", "-m", MSG])
    run(["git", "push", "-q", "origin", "main"])
    print("pushed:", MSG)
