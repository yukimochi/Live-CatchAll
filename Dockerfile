FROM node:alpine

WORKDIR /root
COPY . /root
RUN apk add -U ffmpeg
RUN yarn install

CMD ["node", "index.js"]
