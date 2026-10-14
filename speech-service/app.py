"""Deployable Gradio transport, sharing the real Canto engine with FastAPI."""
import json
import os
import sys
import tempfile
import threading
from pathlib import Path
os.environ.setdefault('GRADIO_ANALYTICS_ENABLED', 'False')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gradio as gr
from backend.cantonese_speech import synthesize, validate_readings

def generate(text, readings_json):
    try:
        readings = json.loads(readings_json)
        validate_readings(text, readings)
        audio = synthesize(text, readings)
    except Exception:
        raise gr.Error('粤语合成失败，请检查输入、所选粤拼、模型下载或服务状态。') from None
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as output:
        output.write(audio)
        path = output.name
    cleanup = threading.Timer(600, lambda: Path(path).unlink(missing_ok=True))
    cleanup.daemon = True
    cleanup.start()
    return path

demo = gr.Interface(fn=generate,
    inputs=[gr.Textbox(label='粤语文字（最多 500 字）'), gr.Textbox(label='逐字读音 JSON，由 Vokawa 发送')],
    outputs=gr.Audio(label='完整粤语音频', type='filepath'),
    api_name='generate', title='Vokawa 粤语语音服务',
    description='模型合成可能偶尔漏字或节奏不稳。输入文字和粤拼在本服务处理。',
    analytics_enabled=False, flagging_mode='never',
    concurrency_limit=1, delete_cache=(600, 600))
if __name__ == '__main__':
    demo.queue(max_size=8).launch(server_name='0.0.0.0', server_port=int(os.getenv('PORT','7860')), share=False)
