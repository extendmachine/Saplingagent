package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

var launcherMessagesJSON = "{}"
var launcherMessages map[string]map[string]string
var launcherLanguage = "en"

func languageTag(value string) string {
	value = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), "_", "-"))
	if value == "zh" || strings.HasPrefix(value, "zh-") {
		return "zh"
	}
	return "en"
}
func loadLanguage(root string) {
	json.Unmarshal([]byte(launcherMessagesJSON), &launcherMessages)
	var preference struct {
		SchemaVersion int    `json:"schemaVersion"`
		Language      string `json:"language"`
	}
	if raw, err := os.ReadFile(filepath.Join(root, "config", "ui-language.json")); err == nil && json.Unmarshal(raw, &preference) == nil && preference.SchemaVersion == 1 && (preference.Language == "en" || preference.Language == "zh") {
		launcherLanguage = preference.Language
	} else {
		launcherLanguage = languageTag(systemLanguage())
	}
	if os.Getenv("SAPLING_LANG_EXPLICIT") == "1" && (os.Getenv("SAPLING_LANG") == "en" || os.Getenv("SAPLING_LANG") == "zh") {
		launcherLanguage = os.Getenv("SAPLING_LANG")
	}
}
func translated(key string) string {
	if message, found := launcherMessages[launcherLanguage][key]; found {
		return message
	}
	if message, found := launcherMessages["en"][key]; found {
		return message
	}
	return key
}
