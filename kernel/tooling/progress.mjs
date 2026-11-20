export function toolProgress({event,name,source},language='en'){
  const zh=language==='zh';
  if(event==='checking')return zh?`正在检测本机 ${name}…`:`Checking local ${name}…`;
  if(event==='installing')return zh?`正在安装共享 ${name}；后续项目将直接复用…`:`Installing shared ${name}; later projects will reuse it…`;
  if(event==='waiting')return zh?`其他项目正在安装 ${name}，正在等待…`:`Another project is installing ${name}; waiting…`;
  return zh?`已复用${source==='shared'?'共享':'本机'} ${name}。`:`Reusing ${source==='shared'?'shared':'local'} ${name}.`;
}
