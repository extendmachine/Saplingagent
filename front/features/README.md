# 按对话生成的应用内容

本目录包含用户通过对话创建的应用组件：CurrentTime显示本地时间；ProjectFileExplorer提供项目文件树、文本预览编辑、绝对地址复制及最近一次保存恢复；ScreenshotButton通过浏览器原生屏幕捕获选择器截取一帧并在本地下载PNG。

基础 main/chat 与 App 独立挂载；生成 App 有单独 ErrorBoundary。组件样式放 styles.css，聊天基础样式在 chat/chat.css。文件浏览器只调用agent-runtime公开同源HTTP接口，不导入后端实现，也不在浏览器保存内部服务token。截屏只在浏览器内生成和下载，不上传或持久化图像。
