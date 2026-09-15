# Compact compiler 0.31.1 (language 0.23.0, compact-runtime 0.16.0) as a container,
# for machines without a native build (e.g. Windows).
#   docker build -t stockandfoil/compactc:0.31.1 tools/compactc
FROM alpine:3.20
ARG COMPACTC_VERSION=0.31.1
RUN apk add --no-cache curl unzip \
 && curl -fsSL -o /tmp/compactc.zip \
      "https://github.com/midnightntwrk/compact/releases/download/compactc-v${COMPACTC_VERSION}/compactc_v${COMPACTC_VERSION}_x86_64-unknown-linux-musl.zip" \
 && mkdir -p /opt/compactc \
 && unzip -q /tmp/compactc.zip -d /opt/compactc \
 && rm /tmp/compactc.zip \
 && chmod +x /opt/compactc/* \
 && /opt/compactc/compactc.bin --version
ENV PATH=/opt/compactc:$PATH
WORKDIR /w
ENTRYPOINT ["compactc.bin"]
