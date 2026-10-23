package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func background(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} }

// The macOS applet owns the visible AppKit progress window and Dock lifetime.
func showNativeProgress(name string) {}
func setNativeProgress(phase string) {}
func closeNativeProgress()           {}

// One cancellation context spans runtime bootstrap and Node startup, so a Quit
// between those phases cannot accidentally start a new service cluster.
var dockContext = context.Background()

func enableDockSignals() {
	dockContext, _ = signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
}

func runtimeMayBeRunning(root string) bool {
	var record struct {
		Root string `json:"root"`
		PID  int    `json:"pid"`
	}
	data, err := os.ReadFile(filepath.Join(root, ".runtime/runtime-address.json"))
	if err != nil {
		return !os.IsNotExist(err)
	}
	if json.Unmarshal(data, &record) != nil {
		return true
	}
	return record.Root == root && record.PID > 1 && syscall.Kill(record.PID, 0) == nil
}

func dockForeground(cmd *exec.Cmd, bootstrap bool) error {
	if err := dockContext.Err(); err != nil {
		return err
	}
	if bootstrap {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-dockContext.Done():
		if bootstrap {
			// Only the process group created immediately above is signalled.
			// Bash gets a chance to release its own installation lock first.
			syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
			select {
			case err := <-done:
				return err
			case <-time.After(5 * time.Second):
				syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
				return <-done
			}
		}
		// The Node bridge owns service and installer cleanup. Do not kill its
		// descendants or detach it while it is still releasing those resources.
		cmd.Process.Signal(syscall.SIGTERM)
		return <-done
	}
}

func runtimeBootstrap(root string, env []string) *exec.Cmd {
	cmd := exec.Command("/bin/bash", filepath.Join(root, "kernel/scripts/macos/bootstrap.sh"), "runtime-only")
	cmd.Env = env
	return cmd
}

func systemLanguage() string {
	if value := os.Getenv("LC_ALL"); value != "" {
		return value
	}
	if value := os.Getenv("LANG"); value != "" {
		return value
	}
	raw, err := exec.Command("/usr/bin/defaults", "read", "-g", "AppleLanguages").Output()
	if err == nil {
		for _, value := range strings.FieldsFunc(string(raw), func(r rune) bool {
			return r == '(' || r == ')' || r == ',' || r == '\n' || r == ' ' || r == '\t' || r == '"'
		}) {
			if value != "" {
				return value
			}
		}
	}
	return "en"
}
