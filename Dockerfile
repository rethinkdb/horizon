FROM node:4

RUN mkdir -p /usr/horizon
COPY client /usr/horizon/client
COPY server /usr/horizon/server
WORKDIR /usr/horizon
RUN cd client; npm install
RUN cd server; npm install -g

EXPOSE 8181
CMD ["horizon", "--dev", "--bind", "all"]
