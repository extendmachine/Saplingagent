package main

import (
	"runtime"
	"sync/atomic"
	"syscall"
	"unsafe"
)

// A small Win32 window uses only system APIs. Closing it hides progress and
// never ends the startup worker. The existing browser page takes over at ready.
var progressUser32 = syscall.NewLazyDLL("user32.dll")
var progressKernel32 = syscall.NewLazyDLL("kernel32.dll")
var progressHandle atomic.Uintptr
var progressText atomic.Value
var progressLabel uintptr
var progressClosed = make(chan struct{})

const progressUpdate = 0x8001
const progressFinish = 0x8002

type windowClass struct {
	Size, Style             uint32
	Procedure               uintptr
	ClassExtra, WindowExtra int32
	Instance, Icon, Cursor  uintptr
	Background              uintptr
	Menu, Name              *uint16
	SmallIcon               uintptr
}

type windowMessage struct {
	Window  uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	X, Y    int32
	Private uint32
}

func wide(value string) *uint16 { return syscall.StringToUTF16Ptr(value) }

func progressWindowProc(window uintptr, message uint32, wparam, lparam uintptr) uintptr {
	switch message {
	case 0x0010: // WM_CLOSE: closing the display is not Stop app.
		progressUser32.NewProc("ShowWindow").Call(window, 0)
		return 0
	case progressUpdate:
		if value, ok := progressText.Load().(string); ok && progressLabel != 0 {
			progressUser32.NewProc("SetWindowTextW").Call(progressLabel, uintptr(unsafe.Pointer(wide(value))))
		}
		return 0
	case progressFinish:
		progressUser32.NewProc("DestroyWindow").Call(window)
		return 0
	case 0x0002: // WM_DESTROY
		progressHandle.Store(0)
		progressUser32.NewProc("PostQuitMessage").Call(0)
		return 0
	}
	value, _, _ := progressUser32.NewProc("DefWindowProcW").Call(window, uintptr(message), wparam, lparam)
	return value
}

func showNativeProgress(name string) {
	initialized := make(chan struct{})
	progressText.Store(translated(progressMessages["checking"]))
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		defer close(progressClosed)
		instance, _, _ := progressKernel32.NewProc("GetModuleHandleW").Call(0)
		cursor, _, _ := progressUser32.NewProc("LoadCursorW").Call(0, 32512)
		class := windowClass{Instance: instance, Cursor: cursor, Background: 6, Name: wide("SaplingagentStartupProgress"), Procedure: syscall.NewCallback(progressWindowProc)}
		class.Size = uint32(unsafe.Sizeof(class))
		registered, _, _ := progressUser32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&class)))
		if registered == 0 {
			close(initialized)
			return
		}
		screenWidth, _, _ := progressUser32.NewProc("GetSystemMetrics").Call(0)
		screenHeight, _, _ := progressUser32.NewProc("GetSystemMetrics").Call(1)
		window, _, _ := progressUser32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(class.Name)), uintptr(unsafe.Pointer(wide(name+translated(" — Starting project")))), 0x00CA0000, (screenWidth-580)/2, (screenHeight-220)/2, 580, 220, 0, 0, instance, 0)
		if window == 0 {
			close(initialized)
			return
		}
		addLabel := func(text string, top, height uintptr) uintptr {
			label, _, _ := progressUser32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(wide("STATIC"))), uintptr(unsafe.Pointer(wide(text))), 0x50000000, 24, top, 520, height, window, 0, instance, 0)
			font, _, _ := syscall.NewLazyDLL("gdi32.dll").NewProc("GetStockObject").Call(17)
			progressUser32.NewProc("SendMessageW").Call(label, 0x0030, font, 1)
			return label
		}
		progressLabel = addLabel(translated(progressMessages["checking"]), 28, 52)
		addLabel(translated("The project status page will open when the local service is available.")+"\r\n"+translated("Closing this window hides it; startup continues. Use Stop app on the status page to stop services."), 88, 76)
		progressHandle.Store(window)
		progressUser32.NewProc("ShowWindow").Call(window, 5)
		progressUser32.NewProc("UpdateWindow").Call(window)
		close(initialized)
		var message windowMessage
		for {
			result, _, _ := progressUser32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
			if int32(result) <= 0 {
				return
			}
			progressUser32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&message)))
			progressUser32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&message)))
		}
	}()
	<-initialized
}

func setNativeProgress(phase string) {
	if message, known := progressMessages[phase]; known {
		progressText.Store(translated(message))
		if window := progressHandle.Load(); window != 0 {
			progressUser32.NewProc("PostMessageW").Call(window, progressUpdate, 0, 0)
		}
	}
}

func closeNativeProgress() {
	if window := progressHandle.Load(); window != 0 {
		progressUser32.NewProc("PostMessageW").Call(window, progressFinish, 0, 0)
		<-progressClosed
	}
}
