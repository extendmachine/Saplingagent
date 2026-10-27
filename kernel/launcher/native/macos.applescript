use framework "Foundation"
use framework "AppKit"
use scripting additions

property helperPath : missing value
property ownerPID : missing value
property ownerNonce : missing value
property startupTask : missing value
property permitExit : false
property reportedFailure : false
property progressWindow : missing value
property progressLabel : missing value
property progressDetail : missing value
property uiLanguage : "en"
property uiCatalog : missing value

on loadLanguage()
 set uiLanguage to "en"
 try
  set appPath to (current application's NSString's stringWithString:(POSIX path of (path to me)))'s stringByStandardizingPath()
  set projectPath to appPath's stringByDeletingLastPathComponent()
  set preferred to (current application's NSLocale's preferredLanguages())'s firstObject() as text
  if preferred starts with "zh" then set uiLanguage to "zh"
  set preferenceData to current application's NSData's dataWithContentsOfFile:(projectPath's stringByAppendingPathComponent:"config/ui-language.json")
  if preferenceData is not missing value then
   set preference to current application's NSJSONSerialization's JSONObjectWithData:preferenceData options:0 |error|:(missing value)
   if preference is not missing value then
    set storedLanguage to (preference's objectForKey:"language") as text
    if ((preference's objectForKey:"schemaVersion") as integer) is 1 and (storedLanguage is "en" or storedLanguage is "zh") then set uiLanguage to storedLanguage
   end if
  end if
  set catalogData to current application's NSData's dataWithContentsOfFile:(appPath's stringByAppendingPathComponent:"Contents/Resources/launcher-messages.json")
  if catalogData is not missing value then set uiCatalog to current application's NSJSONSerialization's JSONObjectWithData:catalogData options:0 |error|:(missing value)
 on error
  -- Invalid preference must never change startup/quit ownership.
 end try
end loadLanguage

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
		my loadLanguage()
		set helperPath to (POSIX path of (path to me)) & "Contents/MacOS/launcher"
		set ownerPID to ((current application's NSProcessInfo's processInfo()'s processIdentifier()) as integer) as text
		set ownerNonce to (current application's NSUUID's UUID()'s UUIDString()) as text
	end if
end initializeOwner

on invokeHelper(actionName)
	my initializeOwner()
	return do shell script ("SAPLING_LANG=" & quoted form of uiLanguage & " SAPLING_LANG_EXPLICIT=1 " & quoted form of helperPath & " " & quoted form of actionName & " --dock-pid " & quoted form of ownerPID & " --dock-nonce " & quoted form of ownerNonce)
end invokeHelper

on beginLaunch(actionName)
	my loadLanguage()
	my initializeOwner()
	if startupTask is not missing value then
		if (startupTask's isRunning()) as boolean then
			my showProgress((my translated("Preparing dependencies and starting the project…")))
			return
		end if
	end if
	set reportedFailure to false
	my showProgress((my translated("Preparing dependencies and starting the project…")))
	set startupTask to current application's NSTask's alloc()'s init()
	set childEnvironment to (current application's NSProcessInfo's processInfo()'s environment())'s mutableCopy()
	childEnvironment's setObject:uiLanguage forKey:"SAPLING_LANG"
	childEnvironment's setObject:"1" forKey:"SAPLING_LANG_EXPLICIT"
	startupTask's setEnvironment:childEnvironment
	startupTask's setLaunchPath:helperPath
	startupTask's setArguments:{actionName, "--dock-pid", ownerPID, "--dock-nonce", ownerNonce}
	startupTask's setCurrentDirectoryPath:((current application's NSString's stringWithString:(POSIX path of (path to me)))'s stringByDeletingLastPathComponent())
	startupTask's setStandardOutput:(current application's NSFileHandle's fileHandleWithNullDevice())
	startupTask's setStandardError:(current application's NSFileHandle's fileHandleWithNullDevice())
	startupTask's |launch|()
end beginLaunch

on reportFailure(messageText)
	my loadLanguage()
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
	try
		set currentState to paragraph 1 of (my invokeHelper("--dock-status"))
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
		-- A transient status failure must not silently remove the user's Quit control.
	end try
	return 2
end idle

on quit
	my loadLanguage()
	if permitExit then
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
