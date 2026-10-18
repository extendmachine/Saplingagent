param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Png)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SaplingIconResource {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr BeginUpdateResource(string file,bool deleteExisting);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool UpdateResource(IntPtr handle,IntPtr type,IntPtr name,ushort lang,byte[] data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool EndUpdateResource(IntPtr handle,bool discard);
}
'@
$data=[IO.File]::ReadAllBytes($Png)
# A single PNG-backed 256x256 icon is supported by Windows10/11.
$stream=New-Object IO.MemoryStream
$writer=New-Object IO.BinaryWriter($stream)
$writer.Write([UInt16]0);$writer.Write([UInt16]1);$writer.Write([UInt16]1)
$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0)
$writer.Write([UInt16]1);$writer.Write([UInt16]32);$writer.Write([UInt32]$data.Length);$writer.Write([UInt16]1)
$group=$stream.ToArray();$writer.Dispose();$stream.Dispose()
$handle=[SaplingIconResource]::BeginUpdateResource($Executable,$false)
if($handle -eq [IntPtr]::Zero){throw 'Cannot open the staged launcher icon resource.'}
try {
 if(-not [SaplingIconResource]::UpdateResource($handle,[IntPtr]3,[IntPtr]1,0,$data,$data.Length)){throw 'Cannot write launcher icon.'}
 if(-not [SaplingIconResource]::UpdateResource($handle,[IntPtr]14,[IntPtr]1,0,$group,$group.Length)){throw 'Cannot write launcher icon group.'}
 if(-not [SaplingIconResource]::EndUpdateResource($handle,$false)){throw 'Cannot finish launcher icon.'}
 $handle=[IntPtr]::Zero
} finally {if($handle -ne [IntPtr]::Zero){[void][SaplingIconResource]::EndUpdateResource($handle,$true)}}
