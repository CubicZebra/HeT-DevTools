#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys
import shutil
import tempfile


def run(cmd):
    print(">>", " ".join(cmd))
    subprocess.run(cmd, check=True)


def require_tool(tool_name):
    if shutil.which(tool_name) is None:
        print(f"未找到命令: {tool_name}，请先安装后再试")
        sys.exit(1)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--binary", required=True, help="本地二进制/ELF路径")
    p.add_argument("--remote", default="/tmp/main", help="板端目标路径")
    p.add_argument("--mode", choices=["adb", "ssh", "openocd", "pyocd", "jlink"], required=True)
    p.add_argument("--host", help="ssh 目标地址，如 root@192.168.77.2")
    p.add_argument("--run", action="store_true", help="传输后立即执行")
    p.add_argument("--addr", default="0x08000000", help="MCU 烧录起始地址（.bin 常用）")
    p.add_argument("--interface", default="interface/stlink.cfg", help="openocd 接口配置")
    p.add_argument("--target", help="openocd target cfg（openocd 模式必填）或 pyocd target name")
    p.add_argument("--transport", choices=["swd", "jtag"], default="swd", help="openocd 传输协议（默认 swd）")
    p.add_argument("--probe", help="pyocd 探针ID（如 69613170 或 jlink:69613170）")
    p.add_argument("--device", help="J-Link 目标器件名（jlink 模式必填），如 BAT32G157GK64FB")
    p.add_argument("--speed", default="4000", help="J-Link 接口速度(kHz)，默认 4000")
    p.add_argument("--no-verify", action="store_true", help="MCU 烧录后不做 verify")
    p.add_argument("--cmsis-vid-pid", help="非标准 CMSIS-DAP 探针的 VID:PID如沩恒 WCH-Link），格式 0x1a86:0x8012")
    args = p.parse_args()

    if not os.path.isfile(args.binary):
        print(f"二进制不存在: {args.binary}")
        sys.exit(1)

    if args.mode == "adb":
        run(["adb", "devices"])
        run(["adb", "push", args.binary, args.remote])
        run(["adb", "shell", "chmod", "+x", args.remote])
        if args.run:
            run(["adb", "shell", args.remote])

    elif args.mode == "ssh":
        if not args.host:
            print("ssh 模式需要 --host，例如 root@192.168.77.2")
            sys.exit(1)
        run(["scp", args.binary, f"{args.host}:{args.remote}"])
        run(["ssh", args.host, "chmod", "+x", args.remote])
        if args.run:
            run(["ssh", args.host, args.remote])

    elif args.mode == "openocd":
        if not args.target:
            print("openocd 模式需要 --target，例如 target/stm32f4x.cfg")
            sys.exit(1)
        require_tool("openocd")

        verify_part = "" if args.no_verify else " verify"
        ext = os.path.splitext(args.binary)[1].lower()
        if ext in (".bin", ".img"):
            program_cmd = f"program {args.binary} {args.addr}{verify_part} reset exit"
        else:
            # ELF/HEX 由 openocd 根据文件元信息处理地址
            program_cmd = f"program {args.binary}{verify_part} reset exit"

        # ST-Link 走 HLA（High-Level Adapter）私有协议，interface cfg 已固定 transport，
        # 需要用 hla_swd/hla_jtag 前缀，显式再选 swd/jtag 会与其冲突报错。
        # CMSIS-DAP 等标准适配器走普通 swd/jtag，不带 hla_ 前缀。
        transport = args.transport
        if "stlink" in args.interface.lower():
            transport = f"hla_{args.transport}"

        cmd = ["openocd", "-f", args.interface]
        if args.cmsis_vid_pid:
            # 非 ARM 官方 VID/PID（如沩恒 WCH-Link 的 0x1a86:0x8012）不在 openocd 内置白名单中，
            # 即使协议兼容也会报 "unable to find a matching CMSIS-DAP device"，需显式白名单。
            vid, pid = args.cmsis_vid_pid.split(":")
            cmd += ["-c", f"cmsis_dap_vid_pid {vid} {pid}"]
        cmd += [
            "-f", args.target,
            "-c", f"transport select {transport}",
            "-c", "init",
            "-c", "halt",
            "-c", program_cmd,
        ]
        run(cmd)

    elif args.mode == "pyocd":
        if not args.target:
            print("pyocd 模式需要 --target，例如 stm32f407vg")
            sys.exit(1)
        require_tool("pyocd")

        # J-Link CE + pyocd 在 non_interactive=true 时可能出现 open(serial) 失败。
        cmd = [sys.executable, "-m", "pyocd", "flash", args.binary, "-t", args.target,
               "-O", "jlink.non_interactive=false"]
        if args.probe:
            cmd.extend(["-u", args.probe])
        ext = os.path.splitext(args.binary)[1].lower()
        if ext in (".bin", ".img"):
            cmd.extend(["-a", args.addr])
        if args.no_verify:
            cmd.append("--no-verify")
        run(cmd)

    elif args.mode == "jlink":
        if not args.device:
            print("jlink 模式需要 --device，例如 BAT32G157GK64FB")
            sys.exit(1)

        jlink_exe = shutil.which("JLinkExe")
        if jlink_exe is None:
            print("未找到命令: JLinkExe，请先安装 SEGGER J-Link 软件包")
            sys.exit(1)

        ext = os.path.splitext(args.binary)[1].lower()
        jlink_binary_path = args.binary
        temp_bin_path = None

        # J-Link Commander does not recognize custom extensions like .img,
        # even with an explicit address. Convert to a temporary .bin path.
        if ext == ".img":
            with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f_bin:
                temp_bin_path = f_bin.name
            shutil.copyfile(args.binary, temp_bin_path)
            jlink_binary_path = temp_bin_path

        if ext in (".bin", ".img"):
            load_cmd = f"loadfile {jlink_binary_path} {args.addr}"
            verify_cmd = f"verifybin {jlink_binary_path} {args.addr}"
        else:
            # HEX/ELF/AXF 使用文件内地址信息。
            # J-Link 的 loadfile 已包含下载后校验，无需额外 verify 命令。
            load_cmd = f"loadfile {args.binary}"
            verify_cmd = None

        script_lines = [
            "r",
            "h",
            load_cmd,
        ]
        if (not args.no_verify) and verify_cmd:
            script_lines.append(verify_cmd)
        script_lines.append("r")
        if args.run:
            script_lines.append("g")
        script_lines.append("q")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jlink", delete=False) as f:
            script_path = f.name
            f.write("\n".join(script_lines) + "\n")

        try:
            cmd = [
                jlink_exe,
                "-device", args.device,
                "-if", args.transport.upper(),
                "-speed", str(args.speed),
                "-CommanderScript", script_path,
                "-ExitOnError", "1",
            ]
            if args.probe:
                probe = args.probe
                if probe.startswith("jlink:"):
                    probe = probe.split(":", 1)[1]
                cmd.extend(["-SelectEmuBySN", probe])
            run(cmd)
        finally:
            try:
                os.remove(script_path)
            except OSError:
                pass
            if temp_bin_path:
                try:
                    os.remove(temp_bin_path)
                except OSError:
                    pass


if __name__ == "__main__":
    main()
