package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func background(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x00000008 | 0x00000200}
}

func runtimeBootstrap(root string) *exec.Cmd {
	cmd := exec.Command("powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", filepath.Join(root, "kernel/scripts/windows/bootstrap.ps1"))
	cmd.Env = append(os.Environ(), "SAPLING_BOOTSTRAP_ROOT="+root, "SAPLING_BOOTSTRAP_ACTION=runtime-only", "SAPLING_BOOTSTRAP_FLAG=", "SAPLING_BOOTSTRAP_SECOND_FLAG=")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}
