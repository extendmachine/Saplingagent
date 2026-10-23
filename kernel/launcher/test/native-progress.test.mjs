import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildEnv, prepareBuildStorage } from '../build.mjs';

const exec = promisify(execFile);
const source = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const go = path.join(source, `.runtime/go1.27.2-${platform}-${process.arch === 'x64' ? 'amd64' : process.arch}/go/bin`, process.platform === 'win32' ? 'go.exe' : 'go');
const available = await fs.access(go).then(() => true, () => false);

test('native progress reads only new fixed markers, closes its file between reads and reports worker failure', { skip: !available, timeout: 120000 }, async t => {
  const parent = path.join(source, '.cache/native-progress-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'progress-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepareBuildStorage(root);
  await fs.copyFile(path.join(source, 'kernel/launcher/native/progress.go'), path.join(root, 'progress.go'));
  await fs.writeFile(path.join(root, 'progress_test.go'), `package main
import ("os"; "errors"; "testing"; "time"; "path/filepath"; "reflect"; "strings")
func TestMarkers(t *testing.T) {
 for _, line := range []string{"secret=value", "SAPLING_PROGRESS:ready secret=value", " SAPLING_PROGRESS:ready", "SAPLING_PROGRESS:unknown"} { if progressPhase(line)!="" { t.Fatal("untrusted log text accepted") } }
 if progressPhase("SAPLING_PROGRESS:installing\\r\\n")!="installing" { t.Fatal("CRLF marker missing") }
 name:=filepath.Join(t.TempDir(),"progress.log"); old:=[]byte("SAPLING_PROGRESS:ready\\n"); os.WriteFile(name,old,0600)
 done:=make(chan error,1); finished:=make(chan error,1); seen:=make(chan string,10)
 go func(){finished<-followProgress(name,int64(len(old)),done,func(s string){seen<-s})}()
 appendText:=func(s string){f,e:=os.OpenFile(name,os.O_APPEND|os.O_WRONLY,0600);if e!=nil{t.Fatal(e)};f.WriteString(s);f.Close()}
 appendText("provider-secret=value\\nSAPLING_PROGRESS:chec")
 time.Sleep(350*time.Millisecond);select {case v:=<-seen:t.Fatal("partial or historical marker shown",v);default:}
 appendText("king\\n"+strings.Repeat("x",100000)+"\\nSAPLING_PROGRESS:starting\\r\\n")
 got:=[]string{}; deadline:=time.After(3*time.Second)
 for len(got)<2 {select{case s:=<-seen:got=append(got,s);case<-deadline:t.Fatal("missing progress",got)}}
 if !reflect.DeepEqual(got,[]string{"checking","starting"}) {t.Fatal(got)}
 // A live display must not retain a Windows sharing handle between reads.
 moved:=name+".moved"; if e:=os.Rename(name,moved);e!=nil{t.Fatal(e)};if e:=os.Rename(moved,name);e!=nil{t.Fatal(e)}
 failure:=errors.New("worker failed");done<-failure;if e:=<-finished;!errors.Is(e,failure){t.Fatal("lost worker failure",e)}
}
func TestStatusPageTakesOver(t *testing.T) {
 name:=filepath.Join(t.TempDir(),"status.log");os.WriteFile(name,[]byte("SAPLING_PROGRESS:status\\n"),0600)
 done:=make(chan error,1);finished:=make(chan error,1)
 go func(){finished<-followProgress(name,0,done,func(string){})}()
 select {case e:=<-finished:if e!=nil{t.Fatal(e)};case<-time.After(2*time.Second):t.Fatal("progress still owns executable after browser takeover")}
 select {case<-done:t.Fatal("display consumed an uncompleted worker");default:}
}
`);
  const result = await exec(go, ['test', '-count=1', '-v', '.'], { cwd: root, env: buildEnv(root), timeout: 110000 });
  assert.match(result.stdout, /PASS/);
});

test('Windows progress Close hides the window while its worker remains active', { skip: process.platform !== 'win32' || !available, timeout: 120000 }, async t => {
  const parent = path.join(source, '.cache/native-progress-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'window-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await prepareBuildStorage(root);
  for (const name of ['progress.go', 'progress_windows.go', 'localization.go']) await fs.copyFile(path.join(source, 'kernel/launcher/native', name), path.join(root, name));
  await fs.writeFile(path.join(root, 'progress_windows_test.go'), `package main
import ("testing";"time")
func systemLanguage() string{return "en"}
func TestWindowClose(t *testing.T){
 showNativeProgress("Progress fixture");defer closeNativeProgress();window:=progressHandle.Load();if window==0{t.Fatal("window not created")}
 progressUser32.NewProc("PostMessageW").Call(window,0x0010,0,0);time.Sleep(100*time.Millisecond)
 if progressHandle.Load()!=window{t.Fatal("Close ended worker window lifetime")}
 visible,_,_:=progressUser32.NewProc("IsWindowVisible").Call(window);if visible!=0{t.Fatal("Close did not hide")}
 setNativeProgress("installing");time.Sleep(100*time.Millisecond);visible,_,_=progressUser32.NewProc("IsWindowVisible").Call(window);if visible!=0{t.Fatal("updates reopened hidden window")}
 closeNativeProgress();if progressHandle.Load()!=0{t.Fatal("window handle was not released")}
}
`);
  const result = await exec(go, ['test', '-count=1', '-v', '.'], { cwd: root, env: buildEnv(root), timeout: 110000 });
  assert.match(result.stdout, /PASS/);
});
