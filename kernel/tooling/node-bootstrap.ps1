function Test-SaplingNode([string]$Directory, [string]$Version, [string]$Architecture) {
    $exe = Join-Path $Directory 'node.exe'
    if (!(Test-Path -LiteralPath $exe) -or !(Test-Path -LiteralPath (Join-Path $Directory 'node_modules/npm/bin/npm-cli.js'))) { return $false }
    foreach ($check in @(@('--version', "v$Version"), @('-p process.arch', $Architecture))) {
        $info = New-Object Diagnostics.ProcessStartInfo
        $info.FileName = $exe; $info.Arguments = $check[0]
        $info.UseShellExecute = $false; $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
        try {
            $p = [Diagnostics.Process]::Start($info)
            if (!$p.WaitForExit(5000)) { $p.Kill(); return $false }
            if ($p.ExitCode -ne 0 -or $p.StandardOutput.ReadToEnd().Trim() -ne $check[1]) { return $false }
        } catch { return $false } finally { if ($p) { $p.Dispose() }; $p = $null }
    }
    return $true
}
function Get-SaplingToolHome {
    $mode = $env:SAPLING_RUNTIME_MODE
    $marker = Join-Path $SaplingRoot '.runtime/runtime-mode'
    if (!$mode -and (Test-Path -LiteralPath $marker)) { $mode = (Get-Content -LiteralPath $marker -Raw).Trim() }
    if (!$mode) { $mode = 'shared' }
    if ($mode -notin @('shared', 'portable')) { throw (Message 'shared_mode') }
    if ($env:SAPLING_RUNTIME_HOME -and ![IO.Path]::IsPathRooted($env:SAPLING_RUNTIME_HOME)) { throw (Message 'shared_location') }
    if ($mode -eq 'portable') { $homePath = Join-Path $SaplingRoot '.runtime/tool-store' }
    elseif ($env:SAPLING_RUNTIME_HOME) { $homePath = $env:SAPLING_RUNTIME_HOME }
    else { $homePath = Join-Path $env:LOCALAPPDATA 'Saplingagent' }
    return @{ Mode = $mode; HomePath = [IO.Path]::GetFullPath($homePath) }
}
function Set-SaplingNodeAlias([string]$Source, [string]$Alias, [string]$Mode) {
    if ($Source -ne $Alias) {
        $old = Get-Item -LiteralPath $Alias -Force -ErrorAction SilentlyContinue
        if ($old) {
            if ($old.Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($Alias) }
            else { Move-Item -LiteralPath $Alias -Destination ($Alias + '-previous-' + [Guid]::NewGuid().ToString('N')) }
        }
        $linked = $false
        if ($Mode -ne 'portable') {
            try { New-Item -ItemType Junction -Path $Alias -Target $Source -ErrorAction Stop | Out-Null; $linked = $true } catch {}
        }
        if (!$linked) {
            # Portable Node must survive renaming the complete project. Junctions
            # are absolute, so copy the small Node/npm runtime in this mode.
            New-Item -ItemType Directory -Path $Alias -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $Source 'node.exe') -Destination $Alias
            New-Item -ItemType Directory -Path (Join-Path $Alias 'node_modules') -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $Source 'node_modules/npm') -Destination (Join-Path $Alias 'node_modules/npm') -Recurse
        }
    }
    [IO.File]::WriteAllText((Join-Path $SaplingRoot '.runtime/runtime-mode'), $Mode + "`n", (New-Object Text.UTF8Encoding($false)))
    return (Join-Path $Alias 'node.exe')
}
