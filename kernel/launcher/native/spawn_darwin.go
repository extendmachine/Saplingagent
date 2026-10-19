package main

import (
	"os/exec"
	"path/filepath"
	"syscall"
)

func background(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} }

func runtimeBootstrap(root string, env []string) *exec.Cmd {
	cmd := exec.Command("/bin/bash", filepath.Join(root, "kernel/scripts/macos/bootstrap.sh"), "runtime-only")
	cmd.Env = env
	return cmd
}
