# The live site, abrampierce.com. Tailwind is built in a node stage so the
# running image is just Python and gunicorn.
FROM node:20-slim AS css
WORKDIR /build
COPY package.json package-lock.json tailwind.config.js ./
RUN npm ci
COPY app ./app
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=css /build/app/static/dist ./app/static/dist
EXPOSE 8000
CMD ["gunicorn", "-b", "0.0.0.0:8000", "-w", "2", "run:app"]
