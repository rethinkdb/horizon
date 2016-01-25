FROM node:4

RUN mkdir -p /usr/fusion
COPY client /usr/fusion/client
COPY server /usr/fusion/server
WORKDIR /usr/fusion
RUN cd client; npm install
RUN cd client; ./build.js
RUN cd server; npm install -g

EXPOSE 8181
CMD ["fusion", "--dev", "--bind", "all"]
