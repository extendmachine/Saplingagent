package main

import (
	"io"
	"os"
	"strings"
	"time"
)

// Native UI shows a closed vocabulary, never arbitrary command output, paths,
// credentials or provider errors from a log. The existing log remains the source.
var progressMessages = map[string]string{
	"checking":   "Checking project dependencies…",
	"installing": "Installing local dependencies. This may take a few minutes…",
	"starting":   "Starting the project and opening its status page…",
	"status":     "Project status is available. If the browser did not open, inspect logs/project-launcher.",
	"ready":      "The project is ready. If the browser did not open, inspect logs/project-launcher.",
	"failed":     "Startup could not complete. Check logs/project-launcher.",
}

func progressPhase(line string) string {
	phase := strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
	if !strings.HasPrefix(phase, "SAPLING_PROGRESS:") {
		return ""
	}
	phase = strings.TrimPrefix(phase, "SAPLING_PROGRESS:")
	if _, valid := progressMessages[phase]; !valid {
		return ""
	}
	return phase
}

func followProgress(name string, offset int64, done <-chan error, report func(string)) error {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	pending := ""
	statusAvailable := false
	read := func() {
		// Short reads close their handle immediately; no tail process or held
		// read handle can prevent an offline configuration move on Windows.
		file, err := os.Open(name)
		if err != nil {
			return
		}
		buffer := make([]byte, 64*1024)
		n, err := file.ReadAt(buffer, offset)
		file.Close()
		if err != nil && err != io.EOF {
			return
		}
		offset += int64(n)
		lines := strings.Split(pending+string(buffer[:n]), "\n")
		pending = lines[len(lines)-1]
		if len(pending) > 512 {
			pending = "" // Unbounded command lines cannot accumulate in memory.
		}
		for _, line := range lines[:len(lines)-1] {
			if phase := progressPhase(line); phase != "" {
				report(phase)
				if phase == "status" {
					statusAvailable = true
				}
			}
		}
	}
	for {
		select {
		case err := <-done:
			read()
			return err
		case <-ticker.C:
			read()
			if statusAvailable {
				// Node remains detached and owns its preparation/runtime leases.
				// The verified status page now reports further progress/errors.
				return nil
			}
		}
	}
}
