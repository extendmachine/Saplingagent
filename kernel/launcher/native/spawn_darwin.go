package main

import (
	"os/exec"
	"path/filepath"
	"syscall"
)

func background(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} }

func runtimeBootstrap(root string) *exec.Cmd {
	return exec.Command("/bin/bash", filepath.Join(root, "kernel/scripts/macos/bootstrap.sh"), "runtime-only")
}
