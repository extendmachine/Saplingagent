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

// Dock commands are macOS-only; retain the shared bootstrap build on Windows.
func dockForeground(cmd *exec.Cmd, bootstrap bool) error { return cmd.Run() }
func enableDockSignals()                                 {}

func runtimeBootstrap(root string, env []string) *exec.Cmd {
	cmd := exec.Command("powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", filepath.Join(root, "kernel/scripts/windows/bootstrap.ps1"))
	cmd.Env = append(env, "SAPLING_BOOTSTRAP_ROOT="+root, "SAPLING_BOOTSTRAP_ACTION=runtime-only", "SAPLING_BOOTSTRAP_FLAG=", "SAPLING_BOOTSTRAP_SECOND_FLAG=")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}

func runtimeMayBeRunning(root string) bool { return false }

func systemLanguage() string {
	if value := os.Getenv("LC_ALL"); value != "" {
		return value
	}
	if value := os.Getenv("LANG"); value != "" {
		return value
	}
	language, _, _ := syscall.NewLazyDLL("kernel32.dll").NewProc("GetUserDefaultUILanguage").Call()
	if language&0x3ff == 4 {
		return "zh"
	}
	return "en"
}
