FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 MKL_NUM_THREADS=2
WORKDIR /opt/forensics
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY api/local-forensics/requirements-forensics.txt ./
RUN pip install --no-cache-dir -r requirements-forensics.txt \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.14.0
COPY api/local-forensics/server.py api/local-forensics/speech_vad.py api/local-forensics/benchmark.py \
    api/local-forensics/prepare_model.py api/local-forensics/AASIST.conf ./
COPY api/local-forensics/vendor ./vendor
COPY app/assets/models/community_forensics_frontier_fp16.onnx ./models/community_forensics_frontier_fp16.onnx
RUN python prepare_model.py --model-dir ./models \
    && python -c "from server import Engine; Engine('models/community_forensics_frontier_fp16.onnx', 'models/AASIST.pth'); print('Forensic models loaded successfully')" \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin forensics
USER 10001:10001
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8081/health', timeout=4)" || exit 1
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8081", "--image-model", "models/community_forensics_frontier_fp16.onnx", "--audio-model", "models/AASIST.pth"]
