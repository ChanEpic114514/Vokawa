"""FastAPI transport for the preserved v1 Ollama translation core."""
import hmac
import json
import os
import secrets
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from . import translator as core
from . import cantonese_speech

TOKEN = os.getenv('VOKAWA_TOKEN') or secrets.token_urlsafe(24)
GATE = threading.BoundedSemaphore(1)

@asynccontextmanager
async def lifespan(app):
    # Token is intentionally printed once for local setup, never in request logs.
    if not os.getenv('VOKAWA_TOKEN'):
        print('Vokawa connection token: ' + TOKEN, flush=True)
    yield

app = FastAPI(title='Vokawa', version='0.5.0', lifespan=lifespan)
origins = [x.strip() for x in os.getenv('VOKAWA_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'Content-Type'])

def reply(code, obj):
    return JSONResponse(obj, status_code=code, headers={'Cache-Control': 'no-store'})

def authorized(request):
    return hmac.compare_digest(request.headers.get('Authorization', '').encode(), ('Bearer ' + TOKEN).encode())

@app.post('/speech')
async def speech(request: Request):
    if not authorized(request): return reply(401, {'error': '连接令牌不正确'})
    raw = bytearray()
    try:
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 100000: return reply(413, {'error': '请求过大'})
        data = json.loads(raw)
        if not isinstance(data, dict): raise ValueError('需要 JSON 对象')
        cantonese_speech.validate_readings(data.get('text'), data.get('readings'))
        audio = await run_in_threadpool(cantonese_speech.synthesize, data['text'], data['readings'])
        return Response(audio, media_type='audio/wav', headers={'Cache-Control':'no-store'})
    except (ValueError, UnicodeError) as e:
        return reply(400, {'error': str(e)})
    except BlockingIOError as e:
        return reply(429, {'error': str(e)})
    except ImportError:
        return reply(503, {'error':'此后端未安装可选粤语模型依赖。'})
    except Exception:
        return reply(502, {'error':'粤语合成失败；可能是模型下载、内存或本次生成问题，请重试。'})

@app.get('/health')
async def health(request: Request):
    if not authorized(request): return reply(401, {'error': '连接令牌不正确'})
    try:
        result = await run_in_threadpool(core.ollama_request, '/api/tags', timeout=4)
        models = [m['name'] for m in result.get('models', [])]
        ok = core.MODEL in models or core.MODEL + ':latest' in models
        return reply(200, {'ok': ok, 'model': core.MODEL, 'jyutping': core.ToJyutping is not None,
                           'message': '可调用模型' if ok else '请先下载模型：ollama pull ' + core.MODEL})
    except core.ServiceError as e:
        return reply(503, {'error': str(e)})

@app.post('/translate')
async def translate(request: Request):
    if not authorized(request): return reply(401, {'error': '连接令牌不正确'})
    raw = bytearray()
    try:
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 150000: return reply(413, {'error': '请求过大'})
        data = json.loads(raw)
        core.validate(data)
    except (ValueError, UnicodeError) as e:
        return reply(400, {'error': str(e)})
    if not GATE.acquire(blocking=False):
        return reply(429, {'error': '模型正在处理另一项请求，请稍后重试'})
    try:
        result = await run_in_threadpool(core.translate, data)
        return reply(200, result)
    except core.ServiceError as e:
        return reply(502, {'error': str(e)})
    finally:
        GATE.release()
