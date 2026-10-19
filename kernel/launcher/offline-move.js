// Executed only by macOS /usr/bin/osascript (Foundation, no UI automation).
ObjC.import('Foundation');
function run(args) {
  var jobPath = args[0] + '/job.json';
  var data = $.NSData.dataWithContentsOfFile(jobPath);
  if (!data) throw new Error('SETUP_JOB_MISSING');
  var job = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)));
  if (!job || job.schemaVersion !== 1 || !/^[a-f0-9-]{36}$/.test(job.id)) throw new Error('SETUP_JOB_INVALID');
  var fm = $.NSFileManager.defaultManager;
  var directory = String(ObjC.unwrap($(args[0]).stringByStandardizingPath));
  var parent = String(ObjC.unwrap($(job.previousRoot).stringByDeletingLastPathComponent));
  var resolved = String(ObjC.unwrap($(directory).stringByResolvingSymlinksInPath));
  var attrs = fm.attributesOfItemAtPathError(directory, Ref());
  if (!job.helper || !/^sapling-setup-[A-Za-z0-9]+$/.test(job.helper.name) ||
      directory !== parent + '/' + job.helper.name || resolved !== directory ||
      String(ObjC.unwrap($(job.targetRoot).stringByDeletingLastPathComponent)) !== parent ||
      !attrs || String(ObjC.unwrap(attrs.objectForKey($.NSFileType))) !== String(ObjC.unwrap($.NSFileTypeDirectory)) ||
      String(ObjC.unwrap(attrs.objectForKey($.NSFileSystemFileNumber))) !== job.helper.inode ||
      String(ObjC.unwrap(attrs.objectForKey($.NSFileSystemNumber))) !== job.helper.device) throw new Error('SETUP_HELPER_CHANGED');
  if (args[1] === 'cleanup') {
    var cleanupError = Ref();
    if (!fm.removeItemAtPathError(directory, cleanupError)) throw new Error('SETUP_HELPER_CLEANUP_FAILED');
    return 'removed';
  }

  if (args[1] === 'field') return String(job[args[2]]);
  if (args[1] === 'pid') return String(job.management.pid);
  if (args[1] === 'failure') {
    var fm = $.NSFileManager.defaultManager;
    var root = fm.fileExistsAtPath(job.previousRoot) ? job.previousRoot : job.targetRoot;
    var statusFile = root + '/.runtime/setup-finalization.json';
    var statusData = $.NSData.dataWithContentsOfFile(statusFile);
    var status = statusData ? JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(statusData, $.NSUTF8StringEncoding))) : {};
    if (status.id !== job.id) throw new Error('SETUP_JOB_CHANGED');
    if (status.phase !== 'failed') status = {schemaVersion:1,id:job.id,phase:'failed',root:root,error:{code:args[2] || 'PROJECT_RESTART_FAILED',message:'The setup helper could not finish. Settings are retained. Open the setup script from the current folder and inspect the saved restart receipt.'}};
    var writeError = Ref();
    if (!$(JSON.stringify(status)).writeToFileAtomicallyEncodingError(statusFile,true,$.NSUTF8StringEncoding,writeError)) throw new Error('SETUP_STATUS_WRITE');
    var html = '<!doctype html><meta charset="utf-8"><title>Saplingagent setup restart</title><h1>Setup restart needs attention</h1><p>Your settings were saved. Close programs using the project folder, then run Saplingagent.sh configure from its current location. Review .runtime/setup-finalization.json and logs/project-launcher/ before retrying. No automatic rollback was performed.</p>';
    var htmlFile = root + '/.runtime/setup-restart-error.html';
    if (!$(html).writeToFileAtomicallyEncodingError(htmlFile,true,$.NSUTF8StringEncoding,writeError)) throw new Error('SETUP_STATUS_WRITE');
    return htmlFile;
  }
  if (args[1] === 'move') {
    if (job.previousRoot === job.targetRoot) return 'unchanged';
    var error = Ref();
    if (!$.NSFileManager.defaultManager.moveItemAtPathToPathError(job.previousRoot, job.targetRoot, error))
      throw new Error('PROJECT_RENAME_FAILED');
    return 'moved';
  }
  throw new Error('SETUP_HELPER_COMMAND');
}
