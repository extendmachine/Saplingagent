use framework "Foundation"
use framework "AppKit"
use scripting additions

property helperPath : missing value
property ownerPID : missing value
property ownerNonce : missing value
property startupTask : missing value
property permitExit : false
property reportedFailure : false
property statusFailures : 0
property folderAccessDenied : false
property progressWindow : missing value
property progressLabel : missing value
property progressDetail : missing value
property uiLanguage : "en"
property uiCatalog : missing value

on loadBundleLanguage()
 set uiLanguage to "en"
 try
  set preferred to (current application's NSLocale's preferredLanguages())'s firstObject() as text
  if preferred starts with "zh" then set uiLanguage to "zh"
  if uiCatalog is missing value then
   set catalogURL to current application's NSBundle's mainBundle()'s URLForResource:"launcher-messages" withExtension:"json"
   set catalogData to current application's NSData's dataWithContentsOfURL:catalogURL
   if catalogData is not missing value then set uiCatalog to current application's NSJSONSerialization's JSONObjectWithData:catalogData options:0 |error|:(missing value)
  end if
 end try
end loadBundleLanguage

on loadProjectLanguage(projectURL)
 try
  set preferenceData to current application's NSData's dataWithContentsOfURL:(projectURL's URLByAppendingPathComponent:"config/ui-language.json")
  if preferenceData is not missing value then
   set preference to current application's NSJSONSerialization's JSONObjectWithData:preferenceData options:0 |error|:(missing value)
   if preference is not missing value then
    set storedLanguage to (preference's objectForKey:"language") as text
    if ((preference's objectForKey:"schemaVersion") as integer) is 1 and (storedLanguage is "en" or storedLanguage is "zh") then set uiLanguage to storedLanguage
   end if
  end if
 end try
end loadProjectLanguage

on deniedProjectRead(projectURL)
 -- Check a file the launcher needs, in the app that macOS names in the prompt.
 -- A missing or malformed project still follows the ordinary startup diagnostics.
 repeat with relativePath in {"kernel/config/macos.json", "config/macos.json"}
  set configURL to projectURL's URLByAppendingPathComponent:(contents of relativePath)
  set {configHandle, readError} to current application's NSFileHandle's fileHandleForReadingFromURL:configURL |error|:(reference)
  if configHandle is not missing value then
   configHandle's closeFile()
   return false
  end if
  if (readError's domain() as text) is not (current application's NSCocoaErrorDomain as text) then return false
  set errorCode to readError's code() as integer
  -- NSFileHandle can return the generic/write Cocoa error for a read-only open.
  if errorCode is in {(current application's NSFileReadNoPermissionError as integer), (current application's NSFileWriteNoPermissionError as integer)} then return true
  if errorCode is not in {(current application's NSFileReadNoSuchFileError as integer), (current application's NSFileNoSuchFileError as integer)} then return false
 end repeat
 return false
end deniedProjectRead

on translated(messageKey)
 if uiCatalog is not missing value then
  try
   set messages to uiCatalog's objectForKey:uiLanguage
   set messageText to messages's objectForKey:messageKey
   if messageText is not missing value then return messageText as text
  end try
 end if
 return messageKey
end translated

on showProgress(messageText)
	set appName to (current application's NSBundle's mainBundle()'s objectForInfoDictionaryKey:"CFBundleDisplayName") as text
	if progressWindow is missing value then
		set progressWindow to current application's NSWindow's alloc()'s initWithContentRect:{{0, 0}, {520, 170}} styleMask:3 backing:2 defer:false
		progressWindow's setReleasedWhenClosed:false
		progressWindow's setTitle:(appName & (my translated(" — Starting project")))
		set progressLabel to current application's NSTextField's labelWithString:messageText
		progressLabel's setFrame:{{24, 95}, {472, 50}}
		progressLabel's setFont:(current application's NSFont's systemFontOfSize:15)
		(progressWindow's contentView())'s addSubview:progressLabel
		set progressDetail to current application's NSTextField's wrappingLabelWithString:((my translated("The project status page will open when the local service is available.")) & return & (my translated("Closing this window hides it. Use Dock → Quit to stop the project.")))
		progressDetail's setFrame:{{24, 20}, {472, 65}}
		progressDetail's setTextColor:(current application's NSColor's secondaryLabelColor())
		(progressWindow's contentView())'s addSubview:progressDetail
		progressWindow's |center|()
	end if
	progressWindow's setTitle:(appName & (my translated(" — Starting project")))
	progressDetail's setStringValue:((my translated("The project status page will open when the local service is available.")) & return & (my translated("Closing this window hides it. Use Dock → Quit to stop the project.")))
	progressLabel's setStringValue:messageText
	progressWindow's makeKeyAndOrderFront:me
end showProgress

on updateProgress(messageText)
	-- Updating hidden windows must not reopen a display the user closed.
	if progressLabel is not missing value then progressLabel's setStringValue:messageText
end updateProgress

on hideProgress()
	if progressWindow is not missing value then progressWindow's orderOut:me
end hideProgress

on initializeOwner()
	if helperPath is missing value then
		set helperPath to ((current application's NSBundle's mainBundle()'s bundleURL()'s URLByAppendingPathComponent:"Contents/MacOS/launcher")'s |path|()) as text
		set ownerPID to ((current application's NSProcessInfo's processInfo()'s processIdentifier()) as integer) as text
		set ownerNonce to (current application's NSUUID's UUID()'s UUIDString()) as text
	end if
end initializeOwner

on invokeHelper(actionName)
	my initializeOwner()
	return do shell script ("SAPLING_LANG=" & quoted form of uiLanguage & " SAPLING_LANG_EXPLICIT=1 " & quoted form of helperPath & " " & quoted form of actionName & " --dock-pid " & quoted form of ownerPID & " --dock-nonce " & quoted form of ownerNonce)
end invokeHelper

on beginLaunch(actionName)
	if startupTask is not missing value then
		if (startupTask's isRunning()) as boolean then
			my showProgress((my translated("Preparing dependencies and starting the project…")))
			return
		end if
	end if
	my loadBundleLanguage()
	my initializeOwner()
	set reportedFailure to false
	my showProgress((my translated("Opening the project folder…")))
	progressDetail's setStringValue:(my translated("If macOS asks for access to the folder containing this project, choose Allow to continue."))
	progressWindow's displayIfNeeded()
	set projectURL to current application's NSBundle's mainBundle()'s bundleURL()'s URLByDeletingLastPathComponent()
	set folderAccessDenied to my deniedProjectRead(projectURL)
	if folderAccessDenied then
		my updateProgress((my translated("Cannot read the project folder.")))
		progressDetail's setStringValue:(my translated("Check the folder permissions. If macOS denied access, enable this app in System Settings → Privacy & Security → Files & Folders, then reopen it."))
		return
	end if
	my loadProjectLanguage(projectURL)
	my showProgress((my translated("Preparing dependencies and starting the project…")))
	set startupTask to current application's NSTask's alloc()'s init()
	set childEnvironment to (current application's NSProcessInfo's processInfo()'s environment())'s mutableCopy()
	childEnvironment's setObject:uiLanguage forKey:"SAPLING_LANG"
	childEnvironment's setObject:"1" forKey:"SAPLING_LANG_EXPLICIT"
	startupTask's setEnvironment:childEnvironment
	startupTask's setLaunchPath:helperPath
	startupTask's setArguments:{actionName, "--dock-pid", ownerPID, "--dock-nonce", ownerNonce}
	startupTask's setCurrentDirectoryURL:projectURL
	startupTask's setStandardOutput:(current application's NSFileHandle's fileHandleWithNullDevice())
	startupTask's setStandardError:(current application's NSFileHandle's fileHandleWithNullDevice())
	startupTask's |launch|()
end beginLaunch

on reportFailure(messageText)
	my updateProgress((my translated("Startup could not complete. Check logs/project-launcher.")))
	display alert (my translated("Project launcher")) message messageText buttons {(my translated("OK"))} default button 1
end reportFailure

on run
	try
		my beginLaunch("--dock-start")
	on error
		my reportFailure((my translated("The project could not start. Check logs/project-launcher in the project folder, then click the Dock icon to retry.")))
	end try
end run

on reopen
	try
		my beginLaunch("--dock-open")
	on error
		my reportFailure((my translated("The project could not open. Check logs/project-launcher and retry.")))
	end try
end reopen

on idle
	if helperPath is missing value or folderAccessDenied then return 2
	try
		set currentState to paragraph 1 of (my invokeHelper("--dock-status"))
		set statusFailures to 0
		if currentState is "handoff" then
			-- Node completion can precede the helper's final log-handle close.
			if startupTask is not missing value then
				if (startupTask's isRunning()) as boolean then return 1
			end if
			set permitExit to true
			quit
		else if currentState is "failed" and reportedFailure is false then
			set reportedFailure to true
			my reportFailure((my translated("The project could not start. Check logs/project-launcher in the project folder, then click the Dock icon to retry.")))
		else if currentState is "ready" or currentState is "stopped" then
			my hideProgress()
		else if currentState is "bootstrapping" then
			my updateProgress((my translated("Installing the missing local runtime. This may take a few minutes…")))
		else if currentState is "starting" then
			my updateProgress((my translated("Preparing dependencies and starting the project…")))
		end if
		if startupTask is not missing value and reportedFailure is false then
			if not ((startupTask's isRunning()) as boolean) then
				if (startupTask's terminationStatus()) as integer is not 0 then
					set reportedFailure to true
					my reportFailure((my translated("The project could not start. Check logs/project-launcher in the project folder, then click the Dock icon to retry.")))
				end if
			end if
		end if
	on error
		set statusFailures to statusFailures + 1
		if statusFailures ≥ 3 then
			if reportedFailure is false then
				set reportedFailure to true
				my reportFailure((my translated("Could not verify project status. Check logs/project-launcher and click the Dock icon to retry.")))
			end if
			return 15
		end if
	end try
	return 2
end idle

on quit
	-- A denied first open never launched a helper or attached to any services.
	if permitExit or (folderAccessDenied and startupTask is missing value) then
		continue quit
	else
	try
		-- The backend bridge cancels active preparation before stopping its services.
		-- Missing Node is handled by the bootstrap helper below, without reinstalling it.
		my invokeHelper("--dock-stop")
		if startupTask is not missing value then
			if (startupTask's isRunning()) as boolean then
				startupTask's terminate()
				repeat 150 times
					if not ((startupTask's isRunning()) as boolean) then exit repeat
					delay 0.1
				end repeat
				if (startupTask's isRunning()) as boolean then error (my translated("Startup is still stopping."))
			end if
		end if
		continue quit
	on error
		my reportFailure((my translated("The project has not stopped completely. The Dock app will stay open. Check logs/project-launcher, then choose Quit again.")))
	end try
	end if
end quit
