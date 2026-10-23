// Saplingagent customer-compiled bootstrap. Application source stays editable.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

var dockCommand bool
var launcherRoot string

func problem(message string) {
	setNativeProgress("failed")
	if dockCommand {
		fmt.Fprintln(os.Stderr, message)
		os.Exit(1)
	}
	if runtime.GOOS == "darwin" {
		exec.Command("/usr/bin/osascript", "-e", "on run argv\n display alert (item 1 of argv) message (item 2 of argv)\nend run", translated("Project launcher"), message).Run()
	} else {
		c := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show($env.SAPLING_ERROR,$env.SAPLING_ERROR_TITLE)`)
		c.Env = append(os.Environ(), "SAPLING_ERROR="+message, "SAPLING_ERROR_TITLE="+translated("Project launcher"))
		if launcherRoot != "" {
			c.Dir = filepath.Dir(launcherRoot)
		}
		// The system-owned error prompt must not keep this project executable or
		// log open while the user repairs configuration or renames the folder.
		background(c)
		if c.Start() == nil {
			c.Process.Release()
		}
	}
}

// Managed writes derive only from this executable's project, never inherited temp paths.
func localDirectory(root, relative string) (string, error) {
	current := root
	for _, part := range strings.Split(filepath.ToSlash(relative), "/") {
		current = filepath.Join(current, part)
		if err := os.Mkdir(current, 0700); err != nil && !os.IsExist(err) {
			return "", err
		}
		info, err := os.Lstat(current)
		if err != nil {
			return "", err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("project storage is not an ordinary local directory")
		}
	}
	return current, nil
}
func projectEnvironment(root string) ([]string, error) {
	env := os.Environ()
	for _, item := range []struct{ name, relative string }{
		{"TMPDIR", ".runtime/launcher-tmp"}, {"TMP", ".runtime/launcher-tmp"}, {"TEMP", ".runtime/launcher-tmp"},
		{"NODE_COMPILE_CACHE", ".cache/node-compile"}, {"npm_config_cache", ".cache/npm"}, {"XDG_CONFIG_HOME", "local-secrets/runtime/config"},
		{"XDG_DATA_HOME", "data/runtime"}, {"XDG_STATE_HOME", "data/runtime-state"}, {"XDG_CACHE_HOME", ".cache/runtime"},
	} {
		directory, err := localDirectory(root, item.relative)
		if err != nil {
			return nil, err
		}
		env = append(env, item.name+"="+directory)
	}
	return append(env, "SEED_ROOT="+root, "SAPLING_LANG="+launcherLanguage, "SAPLING_LANG_EXPLICIT=1"), nil
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--verify" {
		return
	}
	if len(os.Args) > 1 && runtime.GOOS == "darwin" {
		switch os.Args[1] {
		case "--dock-start", "--dock-open", "--dock-status", "--dock-stop":
			dockCommand = true
			enableDockSignals()
		}
	}
	exe, err := os.Executable()
	if err != nil {
		problem(translated("Cannot locate this launcher."))
		return
	}
	exe, _ = filepath.EvalSymlinks(exe)
	root := filepath.Dir(exe)
	if runtime.GOOS == "darwin" {
		root = filepath.Clean(filepath.Join(root, "../../.."))
	}
	launcherRoot = root
	loadLanguage(root)
	if len(os.Args) > 1 && os.Args[1] == "--root" {
		fmt.Println(root)
		return
	}
	showNativeProgress(filepath.Base(root))
	defer closeNativeProgress()
	setNativeProgress("checking")
	var cfg struct {
		NodeVersion string `json:"nodeVersion"`
	}
	platform := "macos"
	if runtime.GOOS == "windows" {
		platform = "windows"
	}
	b, err := os.ReadFile(filepath.Join(root, "kernel", "config", platform+".json"))
	// Source recovery can restore a pre-containment kernel; keep that launcher usable.
	if os.IsNotExist(err) {
		b, err = os.ReadFile(filepath.Join(root, "config", platform+".json"))
	}
	if err != nil || json.Unmarshal(b, &cfg) != nil {
		problem(translated("Project configuration is missing. Restore the complete project folder."))
		return
	}
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}
	dir := "node-v" + cfg.NodeVersion + "-darwin-" + arch
	node := filepath.Join(root, ".runtime", dir, "bin", "node")
	if runtime.GOOS == "windows" {
		dir = "node-v" + cfg.NodeVersion + "-win-" + arch
		node = filepath.Join(root, ".runtime", dir, "node.exe")
	}
	env, err := projectEnvironment(root)
	if err != nil {
		problem(translated("Project-local storage is unavailable. Check the folder and retry."))
		return
	}
	logs, err := localDirectory(root, "logs/project-launcher")
	if err != nil {
		problem(translated("Project-local logs are unavailable."))
		return
	}
	logPath := filepath.Join(logs, "project-launcher-"+time.Now().UTC().Format("2006-01-02")+".log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		problem(translated("The project folder is not writable."))
		return
	}
	defer f.Close()
	if _, err = os.Stat(node); err != nil {
		if dockCommand && os.Args[1] == "--dock-status" {
			fmt.Println("bootstrapping")
			return
		}
		if dockCommand && os.Args[1] == "--dock-stop" {
			if runtimeMayBeRunning(root) {
				problem(translated("The project runtime may still be running, but its Node executable is missing. Restore the local runtime before stopping this project."))
			}
			fmt.Println("stopped")
			return
		}
		f.WriteString("Preparing the missing project-local runtime…\n")
		setNativeProgress("installing")
		bootstrap := runtimeBootstrap(root, env)
		bootstrap.Dir = filepath.Dir(root)
		bootstrap.Stdout = f
		bootstrap.Stderr = f
		if dockCommand {
			err = dockForeground(bootstrap, true)
		} else {
			err = bootstrap.Run()
		}
		if err != nil {
			f.WriteString("Runtime preparation failed; inspect this log and retry with network access.\n")
			problem(translated("Project runtime installation failed. Check logs/project-launcher and open the app again after resolving the error."))
			return
		}
		if _, err = os.Stat(node); err != nil {
			problem(translated("Runtime installation did not produce the configured Node executable. Check logs/project-launcher."))
			return
		}
	}
	args := []string{filepath.Join(root, "kernel", "launcher", "entry.mjs"), "--launch"}
	if dockCommand {
		args = append([]string{filepath.Join(root, "kernel", "launcher", "entry.mjs")}, os.Args[1:]...)
	}
	cmd := exec.Command(node, args...)
	cmd.Dir = filepath.Dir(root)
	cmd.Stdout = f
	cmd.Stderr = f
	cmd.Env = env
	if dockCommand {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err = dockForeground(cmd, false); err != nil {
			f.WriteString("Dock lifecycle command did not complete. Inspect the project runtime and retry.\n")
			if exit, ok := err.(*exec.ExitError); ok {
				os.Exit(exit.ExitCode())
			}
			problem(translated("The project operation did not complete. Inspect logs/project-launcher and retry."))
		}
		return
	}
	background(cmd)
	setNativeProgress("starting")
	if runtime.GOOS == "windows" {
		// Keep the small progress window alive until the entry has opened the
		// status page. Children are detached from the display's OS lifecycle.
		offset := int64(0)
		if info, e := f.Stat(); e == nil {
			offset = info.Size()
		}
		if err = cmd.Start(); err != nil {
			problem(translated("The project-local runtime could not start. Check logs/project-launcher."))
			return
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		if err = followProgress(logPath, offset, done, setNativeProgress); err != nil {
			problem(translated("Project startup did not complete. Check logs/project-launcher, then open the app to retry."))
		}
		return
	}
	if err = cmd.Start(); err != nil {
		f.WriteString("Launcher could not start the project-local Node runtime. Repair using Saplingagent.sh.\n")
		problem(translated("The project-local runtime could not start."))
		return
	}
	cmd.Process.Release()
}
