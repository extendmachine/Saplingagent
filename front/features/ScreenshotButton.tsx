import { Camera, Check, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

type CaptureState = 'idle' | 'capturing' | 'done' | 'error';

function waitForVideo(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('屏幕画面加载超时')), 10000);
    video.addEventListener('loadeddata', () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function ScreenshotButton() {
  const [state, setState] = useState<CaptureState>('idle');
  const [message, setMessage] = useState('截取当前屏幕');

  async function captureScreen() {
    if (state === 'capturing') return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState('error');
      setMessage('当前浏览器不支持屏幕截取');
      return;
    }

    setState('capturing');
    setMessage('请选择要截取的屏幕或窗口');
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 1, max: 5 } },
        audio: false,
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      await waitForVideo(video);

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) throw new Error('无法生成屏幕截图');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('无法生成 PNG 文件')), 'image/png');
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `seedagent-screenshot-${stamp}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setState('done');
      setMessage('截图已下载');
      window.setTimeout(() => {
        setState('idle');
        setMessage('截取当前屏幕');
      }, 2200);
    } catch (error) {
      const cancelled = error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name);
      setState('error');
      setMessage(cancelled ? '已取消截屏' : error instanceof Error ? error.message : '截屏失败');
      window.setTimeout(() => {
        setState('idle');
        setMessage('截取当前屏幕');
      }, 2600);
    } finally {
      for (const track of stream?.getTracks() || []) track.stop();
    }
  }

  return (
    <button
      className={`screenshot-button is-${state}`}
      type="button"
      onClick={captureScreen}
      disabled={state === 'capturing'}
      title={message}
      aria-label={message}
    >
      {state === 'capturing' ? <LoaderCircle className="is-spinning" size={16} /> : state === 'done' ? <Check size={16} /> : <Camera size={16} />}
      <span>{state === 'capturing' ? '截取中' : state === 'done' ? '已下载' : state === 'error' ? '未截取' : '截屏'}</span>
    </button>
  );
}
