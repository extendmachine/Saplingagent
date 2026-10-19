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

func problem(message string) {
	if runtime.GOOS == "darwin" {
		exec.Command("/usr/bin/osascript", "-e", `display alert "Project launcher" message "The local runtime could not start. Open Saplingagent.sh and repair the project installation."`).Run()
	} else {
		c := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show($env.SAPLING_ERROR,'Project launcher')`)
		c.Env = append(os.Environ(), "SAPLING_ERROR="+message)
		c.Run()
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
	return append(env, "SEED_ROOT="+root), nil
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--verify" {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		problem("Cannot locate this launcher.")
		return
	}
	exe, _ = filepath.EvalSymlinks(exe)
	root := filepath.Dir(exe)
	if runtime.GOOS == "darwin" {
		root = filepath.Clean(filepath.Join(root, "../../.."))
	}
	if len(os.Args) > 1 && os.Args[1] == "--root" {
		fmt.Println(root)
		return
	}
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
		problem("Project configuration is missing. Restore the complete project folder.")
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
		problem("Project-local storage is unavailable. Check the folder and retry.")
		return
	}
	logs, err := localDirectory(root, "logs/project-launcher")
	if err != nil {
		problem("Project-local logs are unavailable.")
		return
	}
	f, err := os.OpenFile(filepath.Join(logs, "project-launcher-"+time.Now().UTC().Format("2006-01-02")+".log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		problem("The project folder is not writable.")
		return
	}
	defer f.Close()
	if _, err = os.Stat(node); err != nil {
		f.WriteString("Preparing the missing project-local runtime…\n")
		bootstrap := runtimeBootstrap(root, env)
		bootstrap.Dir = filepath.Dir(root)
		bootstrap.Stdout = f
		bootstrap.Stderr = f
		if err = bootstrap.Run(); err != nil {
			f.WriteString("Runtime preparation failed; inspect this log and retry with network access.\n")
			problem("Project runtime installation failed. Check logs/project-launcher and open the app again after resolving the error.")
			return
		}
		if _, err = os.Stat(node); err != nil {
			problem("Runtime installation did not produce the configured Node executable. Check logs/project-launcher.")
			return
		}
	}
	cmd := exec.Command(node, filepath.Join(root, "kernel", "launcher", "entry.mjs"), "--launch")
	cmd.Dir = filepath.Dir(root)
	cmd.Stdout = f
	cmd.Stderr = f
	cmd.Env = env
	background(cmd)
	if err = cmd.Start(); err != nil {
		f.WriteString("Launcher could not start the project-local Node runtime. Repair using Saplingagent.sh.\n")
		problem("The project-local runtime could not start.")
		return
	}
	cmd.Process.Release()
}
