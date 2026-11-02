FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# prisma generate braucht beim Build nur irgendeine DATABASE_URL
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build
ENV NODE_ENV=production
ENV TZ=Europe/Berlin
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
