FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm install --silent
RUN npx prisma generate
RUN npm run build

EXPOSE 7070
CMD ["node", "dist/index.js"]
