use framework "Foundation"
use scripting additions

property helperPath : missing value
property ownerPID : missing value
property ownerNonce : missing value
property startupTask : missing value
property permitExit : false
property reportedFailure : false

on initializeOwner()
	if helperPath is missing value then
		set helperPath to (POSIX path of (path to me)) & "Contents/MacOS/launcher"
		set ownerPID to ((current application's NSProcessInfo's processInfo()'s processIdentifier()) as integer) as text
		set ownerNonce to (current application's NSUUID's UUID()'s UUIDString()) as text
	end if
end initializeOwner

on invokeHelper(actionName)
	my initializeOwner()
	return do shell script (quoted form of helperPath & " " & quoted form of actionName & " --dock-pid " & quoted form of ownerPID & " --dock-nonce " & quoted form of ownerNonce)
end invokeHelper

on beginLaunch(actionName)
	my initializeOwner()
	if startupTask is not missing value then
		if (startupTask's isRunning()) as boolean then return
	end if
	set reportedFailure to false
	set startupTask to current application's NSTask's alloc()'s init()
	startupTask's setLaunchPath:helperPath
	startupTask's setArguments:{actionName, "--dock-pid", ownerPID, "--dock-nonce", ownerNonce}
	startupTask's setCurrentDirectoryPath:((current application's NSString's stringWithString:(POSIX path of (path to me)))'s stringByDeletingLastPathComponent())
	startupTask's setStandardOutput:(current application's NSFileHandle's fileHandleWithNullDevice())
	startupTask's setStandardError:(current application's NSFileHandle's fileHandleWithNullDevice())
	startupTask's |launch|()
end beginLaunch

on reportFailure(messageText)
	display alert "Project launcher" message messageText buttons {"OK"} default button "OK"
end reportFailure

on run
	try
		my beginLaunch("--dock-start")
	on error
		my reportFailure("The project could not start. Check logs/project-launcher in the project folder, then click the Dock icon to retry.")
	end try
end run

on reopen
	try
		my beginLaunch("--dock-open")
	on error
		my reportFailure("The project could not open. Check logs/project-launcher and retry.")
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
			my reportFailure("The project could not start. Check logs/project-launcher in the project folder, then click the Dock icon to retry.")
		end if
		if startupTask is not missing value and reportedFailure is false then
			if not ((startupTask's isRunning()) as boolean) then
				if (startupTask's terminationStatus()) as integer is not 0 then
					set reportedFailure to true
					my reportFailure("The project could not start. Check logs/project-launcher in the project folder, then click the Dock icon to retry.")
				end if
			end if
		end if
	on error
		-- A transient status failure must not silently remove the user's Quit control.
	end try
	return 2
end idle

on quit
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
				if (startupTask's isRunning()) as boolean then error "Startup is still stopping."
			end if
		end if
		continue quit
	on error
		my reportFailure("The project has not stopped completely. The Dock app will stay open. Check logs/project-launcher, then choose Quit again.")
	end try
	end if
end quit
