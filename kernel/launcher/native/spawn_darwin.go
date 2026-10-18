package main

import (
	"os/exec"
	"syscall"
)

func background(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} }
