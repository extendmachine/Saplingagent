import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function forwardEntry(caller,target){
 if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(caller)){
  process.argv[1]=fileURLToPath(target);
  // A query separates direct execution from a prior re-export's module instantiation.
  const entry=new URL(target);entry.searchParams.set('entry','compat');
  await import(entry.href);
 }
}
